// LOCAL TEST FIXTURE for the wallet product-face e2e suite. NOT the Studio
// runtime. It serves the pinned, content-addressed artifact emitted by Studio
// (e2e/fixtures/product-face/<applicationId>/<version>/<hash>/) and a clearly
// labelled FAKE of the contract runtime endpoints that verifies the wallet's
// one-time assertions with the ephemeral test public key and performs the
// "issuer transfer" through the local fake api-v3 test hook.
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "fixtures", "product-face");
const PORT = Number(process.env.PRODUCT_FACE_FIXTURE_PORT || 4101);
const ORIGIN = `http://localhost:${PORT}`;
const WALLET_ORIGIN =
  process.env.PRODUCT_FACE_WALLET_ORIGIN || "http://demo.localhost:3000";
const MOCK_API = process.env.PRODUCT_FACE_MOCK_API || "http://127.0.0.1:4010";
const PUBLIC_KEY = process.env.PRODUCT_FACE_ASSERTION_PUBLIC_KEY
  ? createPublicKey(
      process.env.PRODUCT_FACE_ASSERTION_PUBLIC_KEY.replace(/\\n/g, "\n"),
    )
  : undefined;
const KEY_ID = process.env.PRODUCT_FACE_ASSERTION_KEY_ID || "";
const SETTLED = [
  "Registered",
  "Authenticity verified",
  "In service",
  "Transferred",
];
const PENDING = ["Transfer pending"];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

// Units each test handover grant covers (fake evidence, in memory only).
const GRANTS = {
  "MH-HANDOVER-A": ["6a00000000000000000000a1"],
  "MH-HANDOVER-B": ["6a00000000000000000000b2"],
  "MH-HANDOVER-AB": ["6a00000000000000000000a1", "6a00000000000000000000b2"],
};

let mode = { transferState: "Registered", holdRegistrations: false };
let stats = { assertions: {}, registrations: 0, jti: new Set() };
const evidence = new Map();
const held = [];

const withoutAssertion = (body) =>
  Object.fromEntries(
    Object.entries(body).filter(([key]) => key !== "assertion"),
  );
const sha256 = (value) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 64 * 1024) request.destroy();
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve(undefined);
      }
    });
  });
}

async function manifestFor(applicationId, version, hash) {
  const raw = await readFile(
    path.join(ROOT, applicationId, version, hash, "manifest.json"),
    "utf8",
  );
  return JSON.parse(raw);
}

/** Verifies the wallet assertion for one exact request; consumes its jti once. */
async function verifyAssertion(token, expected) {
  if (!PUBLIC_KEY || typeof token !== "string")
    return "face_wallet_assertion_unprovisioned";
  const [header, claims, signature] = token.split(".");
  if (!header || !claims || !signature) return "face_assertion_invalid";
  const parsedHeader = JSON.parse(
    Buffer.from(header, "base64url").toString("utf8"),
  );
  if (
    parsedHeader.alg !== "EdDSA" ||
    parsedHeader.typ !== "dual-face-assertion+jwt" ||
    parsedHeader.kid !== KEY_ID
  ) {
    return "face_assertion_invalid";
  }
  if (
    !verify(
      null,
      Buffer.from(`${header}.${claims}`),
      PUBLIC_KEY,
      Buffer.from(signature, "base64url"),
    )
  ) {
    return "face_assertion_invalid";
  }
  const c = JSON.parse(Buffer.from(claims, "base64url").toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  const manifest = expected.manifest;
  if (
    c.iss !== WALLET_ORIGIN ||
    c.aud !== `${manifest.applicationId}@${ORIGIN}` ||
    c.origin !== ORIGIN ||
    c.app_id !== manifest.applicationId ||
    c.app_version !== manifest.version ||
    c.artifact !== manifest.artifactHash ||
    c.publisher !== manifest.publisher ||
    c.programme !== manifest.programmeId ||
    c.operation !== expected.operation ||
    c.op_id !== expected.opId ||
    canonical(c.target) !== canonical(expected.target) ||
    c.request_hash !== expected.requestHash ||
    !(c.exp > now) ||
    c.exp - c.iat > 60 ||
    Math.abs(now - c.iat) > 60
  ) {
    return "face_assertion_mismatch";
  }
  if (stats.jti.has(c.jti)) return "face_assertion_replayed";
  stats.jti.add(c.jti);
  stats.assertions[c.operation] = (stats.assertions[c.operation] ?? 0) + 1;
  return { claims: c };
}

async function readback(objectId, holder) {
  const response = await fetch(`${MOCK_API}/public/objects/${objectId}`);
  if (!response.ok) return { status: "outcome_unknown" };
  const object = await response.json();
  const ownerIsHolder = object.owner.toLowerCase() === holder.toLowerCase();
  const state = object.custom?.state ?? null;
  const target = object.custom?.lifecycle?.target_state ?? null;
  if (!ownerIsHolder) return { status: "pending", object };
  if (PENDING.includes(state))
    return { status: "ownership_moved_state_pending", object };
  if (SETTLED.includes(state) && (!target || target === state))
    return { status: "registered", object };
  return { status: "recovery_required", object };
}

const ZERO = {
  writesExecuted: 0,
  dualWritesExecuted: 0,
  unknownWriteOutcomes: 0,
  secretReturned: false,
};

async function runtime(request, response, url, manifest) {
  const body = await readJson(request);
  if (!body)
    return send(response, 400, {
      status: "refused",
      reason: "face_request_invalid",
    });
  const route = url.pathname.slice("/api/product-face/v1".length);

  if (route === "/evidence") {
    const units = GRANTS[String(body.grant || "").trim()];
    if (!units)
      return send(response, 400, { status: "face_evidence_grant_invalid" });
    const handle = `ev-${Math.random().toString(36).slice(2)}`;
    evidence.set(handle, units);
    const listed = [];
    for (const objectId of units) {
      const object = await (
        await fetch(`${MOCK_API}/public/objects/${objectId}`)
      ).json();
      listed.push({
        recordId: `rec-${objectId.slice(-4)}`,
        objectId,
        title: object.metadata.name,
        serialNumber: object.custom.serialNumber,
        model: object.custom.model,
        registration: object.owner.toLowerCase().endsWith("155ae")
          ? "available"
          : "already_registered",
      });
    }
    return send(response, 200, {
      status: "evidence_accepted",
      evidence: handle,
      units: listed,
    });
  }

  if (route === "/registrations") {
    const objectId = (evidence.get(body.evidence) || []).find(
      (id) => `rec-${id.slice(-4)}` === body.recordId,
    );
    if (!objectId)
      return send(response, 400, {
        status: "refused",
        reason: "face_evidence_unit_not_covered",
      });
    const verified = await verifyAssertion(body.assertion, {
      manifest,
      operation: "registration.submit",
      opId: body.operationId,
      target: { object_id: objectId },
      // r6: the hash over the entire exact request body, assertion excluded.
      requestHash: sha256(canonical(withoutAssertion(body))),
    });
    if (typeof verified === "string")
      return send(response, 403, { status: "refused", reason: verified });
    stats.registrations += 1;
    if (mode.holdRegistrations) {
      // Simulates a lost frame mid-operation: the request is never answered.
      held.push(response);
      return;
    }
    const holder = verified.claims.holder;
    await fetch(`${MOCK_API}/__test__/issuer-transfer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object_id: objectId,
        to: holder,
        state: mode.transferState,
        ...(PENDING.includes(mode.transferState)
          ? { lifecycle_target: "Authenticity verified" }
          : {}),
      }),
    });
    const result = await readback(objectId, holder);
    return send(response, 200, {
      status: result.status,
      operationId: body.operationId,
      objectId,
      actionId: null,
      writeOutcome: "committed",
      accounting: {
        providerWritesExecuted: 0,
        dualWritesExecuted: 1,
        readbacksExecuted: 1,
        unknownWriteOutcomes: 0,
      },
    });
  }

  if (route === "/registrations/status") {
    const target =
      JSON.parse(
        Buffer.from(
          String(body.assertion || "..").split(".")[1] || "",
          "base64url",
        ).toString("utf8") || "{}",
      ).target ?? {};
    const verified = await verifyAssertion(body.assertion, {
      manifest,
      operation: "registration.status",
      opId: body.operationId,
      target: { object_id: target.object_id },
      requestHash: sha256(canonical({ operationId: body.operationId })),
    });
    if (typeof verified === "string")
      return send(response, 403, { status: "refused", reason: verified });
    const result = await readback(target.object_id, verified.claims.holder);
    return send(response, 200, {
      status: result.status === "pending" ? "outcome_unknown" : result.status,
      operationId: body.operationId,
      objectId: target.object_id,
      actionId: null,
      ...ZERO,
    });
  }

  if (route === "/operations") {
    const { assertion, ...rest } = body;
    const verified = await verifyAssertion(assertion, {
      manifest,
      operation: body.operation,
      opId: body.operationId,
      target: body.target,
      requestHash: sha256(canonical(rest)),
    });
    if (typeof verified === "string")
      return send(response, 403, {
        status: "refused",
        reason: verified,
        ...ZERO,
      });
    const objectId = body.target?.object_id;
    if (body.operation === "products.private.read") {
      return send(response, 200, {
        status: "private_product_read",
        product: {
          registeredAt: "2026-10-14",
          registrationKind: "first owner (fake)",
          documents: [
            { title: `Warranty for ${objectId}`, body: "Local fake document." },
          ],
        },
        ...ZERO,
      });
    }
    if (body.operation === "registration.settle.propose") {
      if (request.headers.origin)
        return send(response, 403, {
          status: "face_trusted_read_server_only",
          ...ZERO,
        });
      const current = await (
        await fetch(`${MOCK_API}/__test__/objects/${objectId}`)
      ).json();
      // Studio-shaped reviewed proposal: the Dual update body for the unit.
      const input = {
        data: {
          custom: {
            state: "Authenticity verified",
            lifecycle: { target_state: "Authenticity verified" },
            serialNumber: current.custom?.serialNumber,
            action_hash: createHash("sha256")
              .update(`${objectId}:${body.operationId}`)
              .digest("hex"),
          },
        },
      };
      return send(response, 200, {
        ok: true,
        status: "settle_proposed",
        proposal_id: `psp-${body.operationId}`,
        operation_id: body.operationId,
        object_id: objectId,
        action: "update",
        input,
        proposal_hash: sha256(
          canonical({ object_id: objectId, action: "update", input }),
        ),
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        ...ZERO,
      });
    }
    if (body.operation === "registration.settle.verify") {
      const result = await readback(objectId, verified.claims.holder);
      return send(response, 200, {
        status: result.status,
        operationId: body.operationId,
        objectId,
        actionId: body.input?.action_id ?? null,
        ...ZERO,
      });
    }
    return send(response, 200, { status: "ok", ...ZERO });
  }
  return send(response, 404, { status: "not_found" });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", ORIGIN);
  try {
    if (url.pathname === "/health")
      return send(response, 200, { ok: true, fake: true });
    if (url.pathname === "/__test__/mode" && request.method === "POST") {
      mode = { ...mode, ...(await readJson(request)) };
      if (!mode.holdRegistrations)
        held.splice(0).forEach((pending) => pending.destroy());
      return send(response, 200, mode);
    }
    if (url.pathname === "/__test__/reset" && request.method === "POST") {
      mode = { transferState: "Registered", holdRegistrations: false };
      stats = { assertions: {}, registrations: 0, jti: new Set() };
      held.splice(0).forEach((pending) => pending.destroy());
      evidence.clear();
      return send(response, 200, { ok: true });
    }
    if (url.pathname === "/__test__/stats") {
      return send(response, 200, {
        assertions: stats.assertions,
        registrations: stats.registrations,
      });
    }
    // A different-origin page used to prove forged messages are ignored.
    if (url.pathname === "/forged/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><script>
        for (const operation of ["programme.registration.authorize", "programme.runtime.authorize"]) {
          window.parent.postMessage({ type: "dual.face.request", protocol: "dual.face.bridge", version: 1,
            request_id: "forged-" + operation, operation, payload: { object_id: "6a00000000000000000000b2", operation_id: "forged-op-0001" } }, "*");
        }
        window.parent.postMessage({ type: "dual.face.ready", protocol: "dual.face.bridge", version: 1, channel_id: "forged", application: {} }, "*");
        document.title = "forged-sent";
      </script>`);
      return;
    }
    const match =
      /^\/face\/([a-z0-9._-]+)\/([0-9A-Za-z.-]+)\/([0-9a-f]{64})\/(.*)$/.exec(
        url.pathname,
      );
    if (match) {
      const [, applicationId, version, hash, rest] = match;
      const manifest = await manifestFor(applicationId, version, hash).catch(
        () => undefined,
      );
      if (!manifest) return send(response, 404, { status: "not_found" });
      const file = rest || "index.html";
      if (file.includes(".."))
        return send(response, 404, { status: "not_found" });
      const bytes = await readFile(
        path.join(ROOT, applicationId, version, hash, file),
      ).catch(() => undefined);
      if (!bytes) return send(response, 404, { status: "not_found" });
      response.writeHead(200, {
        "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
        "Content-Security-Policy": `frame-ancestors ${WALLET_ORIGIN}`,
        "Cache-Control": "no-store",
      });
      response.end(bytes);
      return;
    }
    if (
      url.pathname.startsWith("/api/product-face/v1/") &&
      request.method === "POST"
    ) {
      const [entry] = await (async () => {
        const { readdir } = await import("node:fs/promises");
        const found = [];
        for (const app of await readdir(ROOT)) {
          for (const version of await readdir(path.join(ROOT, app))) {
            for (const hash of await readdir(path.join(ROOT, app, version)))
              found.push([app, version, hash]);
          }
        }
        return found;
      })();
      if (!entry)
        return send(response, 503, { status: "face_runtime_unprovisioned" });
      return runtime(request, response, url, await manifestFor(...entry));
    }
    return send(response, 404, { status: "not_found" });
  } catch (error) {
    return send(response, 500, {
      status: "fixture_error",
      message: String(error?.message || error),
    });
  }
});

// IPv4 explicitly: the cloud container has no IPv6, and Chromium reaches
// http://localhost:4101 over 127.0.0.1.
server.listen(PORT, "0.0.0.0");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close());
