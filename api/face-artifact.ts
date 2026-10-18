import "server-only";

import { createHash } from "node:crypto";
import type { ProductFaceBinding } from "@/api/product-face-binding";

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_INDEX_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 5_000;
const VERIFIED_TTL_MS = 10 * 60_000;
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const FILE_HASH = /^sha256:[0-9a-f]{64}$/;
const REQUIRED_FILES = ["index.html", "face.js", "face.css"] as const;

export type ArtifactVerification =
  | { ok: true }
  | { ok: false; reason: "artifact_mismatch" | "artifact_unavailable" };

const verified = new Map<string, number>();

/**
 * Bounded, credential-free GET. Redirects are refused: the pinned path is
 * exact, and a redirect could leave it.
 */
export async function fetchBounded(
  url: string,
  maxBytes: number,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<{ status: number; body: Buffer; contentType: string } | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > maxBytes) {
      await response.body?.cancel();
      return undefined;
    }
    const reader = response.body?.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          return undefined;
        }
        chunks.push(Buffer.from(value));
      }
    }
    return {
      status: response.status,
      body: Buffer.concat(chunks),
      contentType: response.headers.get("content-type") ?? "",
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

const sha256Hex = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");

/**
 * artifactHash = sha256 over the lines `<name>\t<sha256:hex>\n` of
 * `manifest.files`, sorted by file name — the emitter's algorithm
 * (contract.artifactVerification). `manifest.files` maps every artifact file
 * except manifest.json to `sha256:<hex>` of its bytes.
 */
export function artifactHashFromFiles(files: Record<string, string>) {
  const lines = Object.keys(files)
    .sort()
    .map((name) => `${name}\t${files[name]}\n`)
    .join("");
  return `sha256:${sha256Hex(lines)}`;
}

export function sriFromFileHash(fileHash: string) {
  return `sha256-${Buffer.from(fileHash.slice("sha256:".length), "hex").toString("base64")}`;
}

function attribute(tag: string, name: string) {
  const match = new RegExp(
    `\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  ).exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

interface Subresource {
  file: string | undefined;
  integrity: string | undefined;
}

function subresources(html: string, base: URL): Subresource[] {
  const result: Subresource[] = [];
  const artifactPath = base.pathname.replace(/index\.html$/, "");
  const resolve = (value: string | undefined) => {
    if (!value) return undefined;
    try {
      const url = new URL(value, base);
      if (url.origin !== base.origin || !url.pathname.startsWith(artifactPath))
        return undefined;
      return url.pathname.slice(artifactPath.length);
    } catch {
      return undefined;
    }
  };
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    const src = attribute(tag, "src");
    if (src === undefined) continue;
    result.push({ file: resolve(src), integrity: attribute(tag, "integrity") });
  }
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attribute(tag, "rel")?.toLowerCase() ?? "";
    if (!rel.split(/\s+/).some((value) => value === "stylesheet")) continue;
    result.push({
      file: resolve(attribute(tag, "href")),
      integrity: attribute(tag, "integrity"),
    });
  }
  return result;
}

function manifestFiles(manifest: unknown) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return undefined;
  }
  const files = (manifest as Record<string, unknown>).files;
  if (!files || typeof files !== "object" || Array.isArray(files)) return;
  const entries = Object.entries(files);
  if (!entries.length || entries.length > 64) return undefined;
  if (
    !entries.every(
      ([name, hash]) =>
        FILE_NAME.test(name) &&
        !name.includes("..") &&
        typeof hash === "string" &&
        FILE_HASH.test(hash),
    )
  ) {
    return undefined;
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

/**
 * Pure verification of fetched artifact bytes against the binding: the
 * manifest's files hash to the pinned artifactHash, index.html is the
 * manifest's index.html, and every script and stylesheet it loads is an
 * artifact file whose SRI value equals the manifest hash.
 */
export function verifyArtifactDocuments(
  binding: ProductFaceBinding,
  manifestBytes: Buffer,
  indexBytes: Buffer,
): boolean {
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    return false;
  }
  const files = manifestFiles(manifest);
  if (!files || !REQUIRED_FILES.every((name) => name in files)) return false;
  const record = manifest as Record<string, unknown>;
  if (
    (record.applicationId !== undefined &&
      record.applicationId !== binding.applicationId) ||
    (record.version !== undefined && record.version !== binding.version) ||
    (record.artifactHash !== undefined &&
      record.artifactHash !== binding.artifactHash) ||
    (record.contract !== undefined &&
      record.contract !== "dual-product-face-v1")
  ) {
    return false;
  }
  if (artifactHashFromFiles(files) !== binding.artifactHash) return false;
  if (`sha256:${sha256Hex(indexBytes)}` !== files["index.html"]) return false;

  const base = new URL(`${binding.origin}${binding.path}index.html`);
  const loaded = subresources(indexBytes.toString("utf8"), base);
  for (const required of ["face.js", "face.css"]) {
    if (!loaded.some((item) => item.file === required)) return false;
  }
  return loaded.every(
    (item) =>
      item.file !== undefined &&
      files[item.file] !== undefined &&
      item.integrity === sriFromFileHash(files[item.file]),
  );
}

/**
 * Independent host-side check of the pinned, content-addressed artifact
 * before any frame is rendered. A success is cached briefly per exact
 * binding; the artifact at a content-addressed path is immutable.
 */
export async function verifyFaceArtifact(
  binding: ProductFaceBinding,
  now = Date.now(),
): Promise<ArtifactVerification> {
  const key = `${binding.origin}${binding.path}|${binding.artifactHash}`;
  const cachedUntil = verified.get(key);
  if (cachedUntil && cachedUntil > now) return { ok: true };

  const base = `${binding.origin}${binding.path}`;
  const [manifest, index] = await Promise.all([
    fetchBounded(`${base}manifest.json`, MAX_MANIFEST_BYTES, {
      headers: { Accept: "application/json" },
    }),
    fetchBounded(`${base}index.html`, MAX_INDEX_BYTES, {
      headers: { Accept: "text/html" },
    }),
  ]);
  if (!manifest || !index) return { ok: false, reason: "artifact_unavailable" };
  if (manifest.status !== 200 || index.status !== 200) {
    return {
      ok: false,
      reason:
        manifest.status === 404 || index.status === 404
          ? "artifact_mismatch"
          : "artifact_unavailable",
    };
  }
  if (!verifyArtifactDocuments(binding, manifest.body, index.body)) {
    verified.delete(key);
    return { ok: false, reason: "artifact_mismatch" };
  }
  verified.set(key, now + VERIFIED_TTL_MS);
  return { ok: true };
}

/** Test seam: forget cached verifications. */
export function resetFaceArtifactCache() {
  verified.clear();
}
