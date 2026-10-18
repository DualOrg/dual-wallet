import type { ProductFaceApplication } from "@/app/_domain/product-face";
import { isRecord } from "@/app/_lib/external-face-bridge/core/protocol";

export interface ExternalFaceApplicationDescriptor {
  id: string;
  majorVersion: number;
  baseUrl: string;
  origin: string;
}

function configuredOrigins() {
  const configured =
    process.env.NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? [];
  if (process.env.NODE_ENV !== "production") {
    configured.push("http://localhost:4100", "http://127.0.0.1:4100");
  }
  return new Set(configured);
}

export function externalFaceBridgeOrigin(displayUrl: string) {
  try {
    const parsed = new URL(displayUrl);
    const localDevelopmentOrigin =
      process.env.NODE_ENV !== "production" &&
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !localDevelopmentOrigin) {
      return undefined;
    }
    const origin = parsed.origin;
    return configuredOrigins().has(origin) ? origin : undefined;
  } catch {
    return undefined;
  }
}

function applicationDescriptor(value: string) {
  const separator = value.indexOf("=");
  const versionSeparator = value.lastIndexOf("@", separator);
  if (separator <= 0 || versionSeparator <= 0) return undefined;
  const id = value.slice(0, versionSeparator).trim();
  const majorVersion = Number(value.slice(versionSeparator + 1, separator));
  try {
    const base = new URL(value.slice(separator + 1).trim());
    if (
      !/^[a-z0-9][a-z0-9._-]{1,127}$/i.test(id) ||
      !Number.isSafeInteger(majorVersion) ||
      majorVersion < 1 ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      !base.pathname.endsWith("/") ||
      externalFaceBridgeOrigin(base.toString()) !== base.origin
    ) {
      return undefined;
    }
    return {
      id,
      majorVersion,
      baseUrl: base.toString(),
      origin: base.origin,
    } satisfies ExternalFaceApplicationDescriptor;
  } catch {
    return undefined;
  }
}

function configuredApplications() {
  const configured =
    process.env.NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS?.split(",")
      .map((value) => applicationDescriptor(value.trim()))
      .filter(
        (value): value is ExternalFaceApplicationDescriptor =>
          value !== undefined,
      ) ?? [];
  if (process.env.NODE_ENV !== "production") {
    configured.push({
      id: "dual.bridge.test",
      majorVersion: 1,
      baseUrl: "http://localhost:4100/bridge/test-host/",
      origin: "http://localhost:4100",
    });
  }
  return configured;
}

export function externalFaceBridgeApplication(displayUrl: string) {
  try {
    const display = new URL(displayUrl);
    return configuredApplications().find((application) => {
      const base = new URL(application.baseUrl);
      return (
        display.origin === base.origin &&
        (display.pathname === base.pathname.slice(0, -1) ||
          display.pathname.startsWith(base.pathname))
      );
    });
  } catch {
    return undefined;
  }
}

function compatibleApplicationVersion(value: unknown, majorVersion: number) {
  return (
    typeof value === "string" &&
    new RegExp(
      `^${majorVersion}\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
    ).test(value)
  );
}

export function externalFaceApplicationMatches(
  descriptor: ExternalFaceApplicationDescriptor,
  application: unknown,
) {
  return (
    isRecord(application) &&
    application.id === descriptor.id &&
    compatibleApplicationVersion(application.version, descriptor.majorVersion)
  );
}

const PRODUCT_READY_KEYS = [
  "id",
  "version",
  "publisher",
  "programme",
  "artifact",
  "contract",
] as const;

export function productFaceFrameUrl(application: ProductFaceApplication) {
  return `${application.origin}${application.path}`;
}

/** The frame URL must be the exact bound origin under the pinned path. */
export function productFaceFrameMatches(
  application: ProductFaceApplication,
  frameUrl: string,
) {
  try {
    const url = new URL(frameUrl);
    return (
      url.origin === application.origin &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname.startsWith(application.path)
    );
  } catch {
    return false;
  }
}

/**
 * Strict ready identity for a product application: exactly these keys, each
 * equal to the server-resolved binding — the version exactly, not its major.
 */
export function productFaceApplicationMatches(
  application: ProductFaceApplication,
  ready: unknown,
) {
  if (!isRecord(ready)) return false;
  const keys = Object.keys(ready);
  return (
    keys.length === PRODUCT_READY_KEYS.length &&
    PRODUCT_READY_KEYS.every((key) => keys.includes(key)) &&
    ready.id === application.id &&
    ready.version === application.version &&
    ready.publisher === application.publisher &&
    ready.programme === application.programme.id &&
    ready.artifact === application.artifact &&
    ready.contract === application.contract
  );
}
