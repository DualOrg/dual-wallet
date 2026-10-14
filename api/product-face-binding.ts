// Pure parser for the deployment-configured product-application registry.
// Kept free of `server-only` and path aliases so next.config.ts can derive the
// exact CSP frame-src origins from the same validation the server uses.
import {
  flattenSettleTemplate,
  isProjectionField,
  isSettleActionName,
  parseSettleLeaves,
  type CanonicalRegistrationRules,
  type ProjectionField,
  type SettleRules,
} from "../app/_domain/product-face";

/**
 * contract r10: a Warranty runtime explicitly connected to this Passport
 * programme. Server-only; used ONLY as the assertion audience and target for
 * case operations.
 */
export interface LinkedRuntime {
  purpose: "claims-warranty";
  applicationId: string;
  origin: string;
  instanceId: string;
}

export interface ProductFaceBinding {
  slug: string;
  applicationId: string;
  version: string;
  publisher: string;
  programmeId: string;
  programmeName: string;
  origin: string;
  path: string;
  artifactHash: string;
  templateIds: string[];
  projectionFields: ProjectionField[];
  canonicalRegistration: CanonicalRegistrationRules;
  settle: SettleRules | null;
  linkedRuntimes: LinkedRuntime[];
}

const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;
const APPLICATION_ID = /^[a-z0-9][a-z0-9._-]{1,127}$/;
const SEMVER =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const PUBLISHER = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const PROGRAMME = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const ARTIFACT = /^sha256:[0-9a-f]{64}$/;
const TEMPLATE_ID = /^[0-9a-f]{24}$/;
const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*){0,5}$/;

const ALIAS = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const HOSTNAME =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const MAX_RAW_BYTES = 64 * 1024;
const MAX_ENTRIES = 32;

const BINDING_KEYS = [
  "slug",
  "applicationId",
  "version",
  "publisher",
  "programmeId",
  "programmeName",
  "origin",
  "path",
  "artifactHash",
  "templateIds",
  "projectionFields",
  "canonicalRegistration",
  "settle",
  "linkedRuntimes",
] as const;
const LINKED_RUNTIME_KEYS = [
  "purpose",
  "applicationId",
  "origin",
  "instanceId",
] as const;
const LINKED_PURPOSES = ["claims-warranty"] as const;
const INSTANCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const CANONICAL_KEYS = [
  "stateField",
  "lifecycleTargetField",
  "settledStates",
  "unconfirmedStates",
  "endedStates",
] as const;
// Two accepted spellings of one rule set: the contract's nested
// `inputTemplate`, or Studio's productFaceSettleInputTemplate() export
// `{inputPath, leaves}` with leaves relative to that path.
const SETTLE_KEYS = [
  "action",
  "alias",
  "inputTemplate",
  "inputPath",
  "leaves",
  "fromStates",
  "targetStates",
] as const;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function displayText(value: unknown, max: number) {
  return typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= max &&
    !/[\u0000-\u001f\u007f<>]/.test(value)
    ? value
    : undefined;
}

function uniqueStrings(
  value: unknown,
  valid: (item: string) => boolean,
  { min = 1, max = 32 } = {},
) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    return undefined;
  }
  if (!value.every((item) => typeof item === "string" && valid(item))) {
    return undefined;
  }
  const items = value as string[];
  return new Set(items).size === items.length ? [...items] : undefined;
}

const stateName = (value: string) => displayText(value, 64) !== undefined;

/** Exact https origin, or loopback http only outside production. */
export function validFaceOrigin(value: unknown, production: boolean) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.origin !== value) return undefined;
    // Exact DNS host names only: no wildcard or other non-host characters.
    if (!HOSTNAME.test(url.hostname) && !LOOPBACK.has(url.hostname)) {
      return undefined;
    }
    if (url.protocol === "https:" && !LOOPBACK.has(url.hostname)) {
      return value;
    }
    // Loopback is a local-development binding only.
    if (
      !production &&
      LOOPBACK.has(url.hostname) &&
      (url.protocol === "http:" || url.protocol === "https:")
    ) {
      return value;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function canonicalRules(
  value: unknown,
): CanonicalRegistrationRules | undefined {
  if (!record(value) || !onlyKeys(value, CANONICAL_KEYS)) return undefined;
  const settledStates = uniqueStrings(value.settledStates, stateName);
  const unconfirmedStates = uniqueStrings(value.unconfirmedStates, stateName, {
    min: 0,
  });
  const endedStates = uniqueStrings(value.endedStates, stateName, { min: 0 });
  if (
    typeof value.stateField !== "string" ||
    !FIELD_PATH.test(value.stateField) ||
    typeof value.lifecycleTargetField !== "string" ||
    !FIELD_PATH.test(value.lifecycleTargetField) ||
    value.stateField === value.lifecycleTargetField ||
    !settledStates ||
    !unconfirmedStates ||
    !endedStates
  ) {
    return undefined;
  }
  const all = [...settledStates, ...unconfirmedStates, ...endedStates];
  if (new Set(all).size !== all.length) return undefined;
  return {
    stateField: value.stateField,
    lifecycleTargetField: value.lifecycleTargetField,
    settledStates,
    unconfirmedStates,
    endedStates,
  };
}

function settleRules(
  value: unknown,
  canonical: CanonicalRegistrationRules,
): SettleRules | null | undefined {
  if (value === undefined || value === null) return null;
  if (!record(value) || !onlyKeys(value, SETTLE_KEYS)) return undefined;
  const fromStates = uniqueStrings(value.fromStates, (item) =>
    canonical.unconfirmedStates.includes(item),
  );
  const targetStates = uniqueStrings(value.targetStates, (item) =>
    canonical.settledStates.includes(item),
  );
  if (
    !isSettleActionName(value.action) ||
    (value.alias !== undefined &&
      (typeof value.alias !== "string" || !ALIAS.test(value.alias))) ||
    !fromStates ||
    !targetStates
  ) {
    return undefined;
  }
  const nested = value.inputTemplate !== undefined;
  const flat = value.leaves !== undefined || value.inputPath !== undefined;
  if (nested === flat) return undefined;
  const leaves = nested
    ? flattenSettleTemplate(value.inputTemplate, targetStates)
    : typeof value.inputPath === "string"
      ? parseSettleLeaves(value.leaves, targetStates, value.inputPath)
      : undefined;
  if (!leaves) return undefined;
  return {
    action: value.action,
    ...(typeof value.alias === "string" ? { alias: value.alias } : {}),
    leaves,
    fromStates,
    targetStates,
  };
}

/**
 * As strict as the main binding: exactly the four keys, an allowed purpose,
 * an exact application ID, origin (https; loopback only outside production)
 * and instance ID, at most one runtime per purpose. Anything else invalidates
 * the whole binding.
 */
function linkedRuntimes(
  value: unknown,
  production: boolean,
): LinkedRuntime[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > LINKED_PURPOSES.length) return;
  const parsed: LinkedRuntime[] = [];
  for (const item of value) {
    if (
      !record(item) ||
      Object.keys(item).length !== LINKED_RUNTIME_KEYS.length ||
      !onlyKeys(item, LINKED_RUNTIME_KEYS) ||
      !(LINKED_PURPOSES as readonly unknown[]).includes(item.purpose) ||
      typeof item.applicationId !== "string" ||
      !APPLICATION_ID.test(item.applicationId) ||
      typeof item.instanceId !== "string" ||
      !INSTANCE_ID.test(item.instanceId)
    ) {
      return undefined;
    }
    const origin = validFaceOrigin(item.origin, production);
    if (!origin) return undefined;
    parsed.push({
      purpose: item.purpose as LinkedRuntime["purpose"],
      applicationId: item.applicationId,
      origin,
      instanceId: item.instanceId,
    });
  }
  return new Set(parsed.map((item) => item.purpose)).size === parsed.length
    ? parsed
    : undefined;
}

function binding(
  value: unknown,
  production: boolean,
): ProductFaceBinding | undefined {
  if (!record(value) || !onlyKeys(value, BINDING_KEYS)) return undefined;
  const {
    slug,
    applicationId,
    version,
    publisher,
    programmeId,
    path,
    artifactHash,
  } = value;
  const programmeName = displayText(value.programmeName, 80);
  const origin = validFaceOrigin(value.origin, production);
  const templateIds = uniqueStrings(value.templateIds, (item) =>
    TEMPLATE_ID.test(item),
  );
  const projectionFields = uniqueStrings(
    value.projectionFields,
    isProjectionField,
    { min: 0, max: 6 },
  ) as ProjectionField[] | undefined;
  const canonicalRegistration = canonicalRules(value.canonicalRegistration);
  if (
    typeof slug !== "string" ||
    !SLUG.test(slug) ||
    typeof applicationId !== "string" ||
    !APPLICATION_ID.test(applicationId) ||
    typeof version !== "string" ||
    !SEMVER.test(version) ||
    typeof publisher !== "string" ||
    !PUBLISHER.test(publisher) ||
    typeof programmeId !== "string" ||
    !PROGRAMME.test(programmeId) ||
    !programmeName ||
    !origin ||
    typeof artifactHash !== "string" ||
    !ARTIFACT.test(artifactHash) ||
    // Content-addressed: the path names the exact artifact it serves.
    path !==
      `/face/${applicationId}/${version}/${artifactHash.slice("sha256:".length)}/` ||
    !templateIds ||
    !projectionFields ||
    !canonicalRegistration
  ) {
    return undefined;
  }
  const settle = settleRules(value.settle, canonicalRegistration);
  if (settle === undefined) return undefined;
  const linked = linkedRuntimes(value.linkedRuntimes, production);
  if (!linked) return undefined;
  // A linked runtime is another application than the face itself.
  if (linked.some((item) => item.applicationId === applicationId)) {
    return undefined;
  }
  return {
    slug,
    applicationId,
    version,
    publisher,
    programmeId,
    programmeName,
    origin,
    path,
    artifactHash,
    templateIds,
    projectionFields,
    canonicalRegistration,
    settle,
    linkedRuntimes: linked,
  };
}

/**
 * Parses PRODUCT_FACE_APPLICATIONS. Invalid entries are dropped, and a slug
 * configured twice drops every entry using it: the registry fails closed
 * rather than guessing which binding a deployment meant.
 */
export function parseProductFaceApplications(
  raw: string | undefined,
  { production }: { production: boolean },
): ProductFaceBinding[] {
  if (!raw || raw.length > MAX_RAW_BYTES) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_ENTRIES) return [];
  const valid = parsed
    .map((entry) => binding(entry, production))
    .filter((entry): entry is ProductFaceBinding => entry !== undefined);
  const slugCounts = new Map<string, number>();
  for (const entry of valid) {
    slugCounts.set(entry.slug, (slugCounts.get(entry.slug) ?? 0) + 1);
  }
  return valid.filter((entry) => slugCounts.get(entry.slug) === 1);
}

/** The exact frame origins the registry binds; never a wildcard. */
export function productFaceFrameOrigins(
  raw: string | undefined,
  options: { production: boolean },
) {
  return Array.from(
    new Set(
      parseProductFaceApplications(raw, options).map((entry) => entry.origin),
    ),
  );
}
