// Wallet-owned model of a reviewed product application ("product face") that a
// programme publisher serves into the authenticated wallet. The shared contract
// is contracts/dual-product-face-v1.json; this module holds its pure rules.

export const PRODUCT_FACE_CONTRACT = "dual-product-face-v1";

export const registrationStatuses = [
  "not_submitted",
  "authorized",
  "pending",
  "ownership_moved_state_pending",
  "review_required",
  "already_registered",
  "registered",
  "refused",
  "recovery_required",
  "outcome_unknown",
] as const;
export type RegistrationStatus = (typeof registrationStatuses)[number];

export function isRegistrationStatus(
  value: unknown,
): value is RegistrationStatus {
  return (
    typeof value === "string" &&
    (registrationStatuses as readonly string[]).includes(value)
  );
}

export const projectionFieldNames = [
  "recordId",
  "title",
  "serialNumber",
  "model",
  "manufacturer",
  "state",
] as const;
export type ProjectionField = (typeof projectionFieldNames)[number];

export function isProjectionField(value: unknown): value is ProjectionField {
  return (
    typeof value === "string" &&
    (projectionFieldNames as readonly string[]).includes(value)
  );
}

const OBJECT_ID = /^[0-9a-f]{24}$/;
const OPERATION_ID = /^[a-z0-9-]{8,64}$/;
const CASE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REQUEST_HASH = /^sha256:[0-9a-f]{64}$/;
const TASK_PATH =
  /^\/(?:[a-z0-9][a-z0-9-]{0,47}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,79}){0,3})?$/;
export const TASK_PATH_MAX_LENGTH = 200;

export function isObjectId(value: unknown): value is string {
  return typeof value === "string" && OBJECT_ID.test(value);
}

export function isOperationId(value: unknown): value is string {
  return typeof value === "string" && OPERATION_ID.test(value);
}

export function isCaseId(value: unknown): value is string {
  return typeof value === "string" && CASE_ID.test(value);
}

export function isRequestHash(value: unknown): value is string {
  return typeof value === "string" && REQUEST_HASH.test(value);
}

export function isTaskPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= TASK_PATH_MAX_LENGTH &&
    TASK_PATH.test(value)
  );
}

/** `/products/<slug><task>` back to the task path, or undefined when foreign. */
export function taskPathFromPathname(pathname: string, slug: string) {
  const prefix = `/products/${slug}`;
  if (pathname === prefix || pathname === `${prefix}/`) return "/";
  if (!pathname.startsWith(`${prefix}/`)) return undefined;
  const task = pathname.slice(prefix.length);
  return isTaskPath(task) ? task : undefined;
}

export function productTaskHref(slug: string, task: string) {
  return task === "/" ? `/products/${slug}` : `/products/${slug}${task}`;
}

export interface CanonicalRegistrationRules {
  stateField: string;
  lifecycleTargetField: string;
  settledStates: string[];
  unconfirmedStates: string[];
  endedStates: string[];
}

/**
 * Exact shape of the input a holder settle may carry. Every key at every
 * level is listed; a leaf is either a literal or one of the reviewed target
 * states. Anything else — a missing or extra key, another value — is refused.
 */
export type SettleTemplateLeaf =
  { $literal: string | number | boolean | null } | { $oneOf: "targetStates" };
export interface SettleInputTemplate {
  [key: string]: SettleTemplateLeaf | SettleInputTemplate;
}

/**
 * The holder-signed action that settles `ownership_moved_state_pending` (G6).
 * Deployment data, not code: the exact reviewed mapping comes from the
 * publisher's reviewed pack.
 */
export interface SettleRules {
  action: SettleActionName;
  alias?: string;
  inputTemplate: SettleInputTemplate;
  fromStates: string[];
  targetStates: string[];
}

// Standard actions a holder settle may use. Ownership-moving or destructive
// actions — claim_ownership, transfer, burn, permit and the like — are never
// a settle, whatever a deployment configures.
export const settleActionNames = [
  "update",
  "set_attributes",
  "remote",
] as const;
export type SettleActionName = (typeof settleActionNames)[number];

export function isSettleActionName(value: unknown): value is SettleActionName {
  return (
    typeof value === "string" &&
    (settleActionNames as readonly string[]).includes(value)
  );
}

const TEMPLATE_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

function plainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isTemplateLeaf(value: unknown): value is SettleTemplateLeaf {
  if (!plainRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 1) return false;
  if (keys[0] === "$literal") {
    const literal = value.$literal;
    return (
      literal === null ||
      typeof literal === "boolean" ||
      (typeof literal === "string" && literal.length <= 200) ||
      (typeof literal === "number" && Number.isFinite(literal))
    );
  }
  return keys[0] === "$oneOf" && value.$oneOf === "targetStates";
}

/** Validates a deployment-supplied template: nested keys, known leaves only. */
export function isSettleInputTemplate(
  value: unknown,
  depth = 0,
): value is SettleInputTemplate {
  if (!plainRecord(value) || depth > 5) return false;
  const entries = Object.entries(value);
  if (!entries.length || entries.length > 16) return false;
  return entries.every(
    ([key, child]) =>
      TEMPLATE_KEY.test(key) &&
      (isTemplateLeaf(child) || isSettleInputTemplate(child, depth + 1)),
  );
}

/** Server-resolved programme binding as the wallet browser code receives it. */
export interface ProductFaceApplication {
  slug: string;
  id: string;
  version: string;
  publisher: string;
  programme: { id: string; name: string };
  origin: string;
  path: string;
  artifact: string;
  contract: typeof PRODUCT_FACE_CONTRACT;
  templateIds: string[];
  projectionFields: ProjectionField[];
  canonicalRegistration: CanonicalRegistrationRules;
  settle: SettleRules | null;
}

export interface ProductFaceEntry {
  slug: string;
  programmeName: string;
  publisher: string;
}

/** A programme object as the wallet reads it for its own holder. */
export interface ProgrammeProduct {
  objectId: string;
  templateId: string;
  name: string;
  imageUrl?: string;
  owner: string;
  custom: Record<string, unknown>;
  modifiedAt: Date;
}

export interface ProductAttribute {
  key: string;
  value: unknown;
}

export interface ProductHistoryEntry {
  actionId: string;
  action: string;
  status: "pending" | "completed" | "failed";
  when: Date;
}

export type CanonicalRegistration =
  | "registered"
  | "ownership_moved_state_pending"
  | "recovery_required"
  | "review_required"
  | "not_owned";

export interface RegistrationReadback {
  ownerIsYou: boolean;
  state: string | null;
  lifecycleTarget: string | null;
}

/** Canonical unit facts the host shows in its own confirmation. */
export interface ProgrammeUnitFacts {
  objectId: string;
  templateId: string;
  name: string;
  imageUrl?: string;
  fields: Partial<Record<ProjectionField, string>>;
  readback: RegistrationReadback;
  registration: CanonicalRegistration;
}

export function readPath(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function stateValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export function registrationReadback(
  owner: string,
  holder: string,
  custom: unknown,
  rules: CanonicalRegistrationRules,
): RegistrationReadback {
  return {
    ownerIsYou:
      Boolean(owner) &&
      Boolean(holder) &&
      owner.toLowerCase() === holder.toLowerCase(),
    state: stateValue(readPath(custom, rules.stateField)),
    lifecycleTarget: stateValue(readPath(custom, rules.lifecycleTargetField)),
  };
}

/**
 * Wallet-side half of the registration rule. Owner equality alone is never
 * registration: the Dual state must be settled and any lifecycle target must
 * agree with it. A pending transfer is explicitly not registered.
 */
export function evaluateCanonicalRegistration(
  readback: RegistrationReadback,
  rules: CanonicalRegistrationRules,
): CanonicalRegistration {
  if (!readback.ownerIsYou) return "not_owned";
  const { state, lifecycleTarget } = readback;
  if (state === null) return "review_required";
  if (rules.endedStates.includes(state)) return "recovery_required";
  if (rules.unconfirmedStates.includes(state)) {
    return "ownership_moved_state_pending";
  }
  if (rules.settledStates.includes(state)) {
    return lifecycleTarget === null || lifecycleTarget === state
      ? "registered"
      : "recovery_required";
  }
  return "review_required";
}

export function projectFields(
  custom: unknown,
  fields: readonly ProjectionField[],
): Partial<Record<ProjectionField, string>> {
  const result: Partial<Record<ProjectionField, string>> = {};
  for (const field of fields) {
    const value = readPath(custom, field);
    if (typeof value === "string" && value.length <= 200) {
      result[field] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      result[field] = String(value);
    }
  }
  return result;
}

export const runtimeOperationNames = [
  "registration.submit",
  "registration.status",
  "registration.settle.propose",
  "registration.settle.verify",
  "products.private.read",
  "cases.list",
  "case.read",
  "case.open",
  "case.evidence.submit",
  "case.information.provide",
  "case.quote.approve",
  "case.quote.decline",
] as const;
export type RuntimeOperation = (typeof runtimeOperationNames)[number];

export const runtimeWriteOperations = [
  "case.open",
  "case.evidence.submit",
  "case.information.provide",
  "case.quote.approve",
  "case.quote.decline",
] as const satisfies readonly RuntimeOperation[];
export type RuntimeWriteOperation = (typeof runtimeWriteOperations)[number];

export function isRuntimeOperation(value: unknown): value is RuntimeOperation {
  return (
    typeof value === "string" &&
    (runtimeOperationNames as readonly string[]).includes(value)
  );
}

export function isRuntimeWriteOperation(
  value: unknown,
): value is RuntimeWriteOperation {
  return (
    typeof value === "string" &&
    (runtimeWriteOperations as readonly string[]).includes(value)
  );
}

/** Operations scoped to one of the holder's own programme products. */
export const productScopedRuntimeOperations = [
  "products.private.read",
  "cases.list",
  "case.read",
  "registration.settle.propose",
  "registration.settle.verify",
  ...runtimeWriteOperations,
] as const satisfies readonly RuntimeOperation[];

export function isProductScopedRuntimeOperation(value: RuntimeOperation) {
  return (productScopedRuntimeOperations as readonly string[]).includes(value);
}

/** The only runtime reads the wallet BFF performs itself, for host UI. */
export const trustedRuntimeReadOperations = [
  "registration.settle.propose",
  "case.read",
] as const satisfies readonly RuntimeOperation[];
export type TrustedRuntimeRead = (typeof trustedRuntimeReadOperations)[number];

export function isQuoteOperation(operation: RuntimeOperation) {
  return (
    operation === "case.quote.approve" || operation === "case.quote.decline"
  );
}

/** Operations whose target names a case as well as the product. */
export function runtimeOperationNeedsCase(operation: RuntimeOperation) {
  return (
    operation === "case.read" ||
    operation === "case.evidence.submit" ||
    operation === "case.information.provide" ||
    operation === "case.quote.approve" ||
    operation === "case.quote.decline"
  );
}

/** Deterministic JSON with sorted keys, used for request and proposal hashes. */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non_finite_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("unsupported_value");
}

export interface SettleFieldChange {
  field: string;
  from: string | null;
  to: string;
}

function displayValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/**
 * Deep-checks proposal input against the reviewed template: exactly the
 * template's keys at every level, each literal leaf equal to its literal and
 * each target-state leaf one reviewed target state, all target-state leaves
 * agreeing. Returns the decoded leaf values, or undefined to refuse.
 */
export function matchSettleTemplate(
  input: unknown,
  template: SettleInputTemplate,
  targetStates: readonly string[],
): Array<[string, unknown]> | undefined {
  const leaves: Array<[string, unknown]> = [];
  const targets = new Set<string>();
  const walk = (
    value: unknown,
    shape: SettleInputTemplate,
    prefix: string,
  ): boolean => {
    if (!plainRecord(value)) return false;
    const expected = Object.keys(shape);
    const actual = Object.keys(value);
    if (
      actual.length !== expected.length ||
      !actual.every((key) => expected.includes(key))
    ) {
      return false;
    }
    return expected.every((key) => {
      const rule = shape[key];
      const child = value[key];
      const path = prefix ? `${prefix}.${key}` : key;
      if (isTemplateLeaf(rule)) {
        if ("$literal" in rule) {
          if (child !== rule.$literal) return false;
        } else {
          if (typeof child !== "string" || !targetStates.includes(child)) {
            return false;
          }
          targets.add(child);
        }
        leaves.push([path, child]);
        return true;
      }
      return walk(child, rule, path);
    });
  };
  if (!walk(input, template, "") || targets.size > 1) return undefined;
  return leaves;
}

/** A proposal the wallet obtained itself from the bound runtime. */
export interface SettleProposal {
  proposalId: string;
  operationId: string;
  objectId: string;
  action: string;
  input: Record<string, unknown>;
  proposalHash: string;
  expiresAt: Date;
}

export type SettleProposalCheck =
  | { ok: true; changes: SettleFieldChange[] }
  | { ok: false; reason: "proposal_rejected" };

/**
 * The proposal is untrusted until it is bound to this unit and original
 * operation, unexpired, the reviewed action, and template-exact. The host
 * derives the changes it shows from the proposal and the fresh object, never
 * from face-supplied text. The hash is checked separately by the caller.
 */
export function checkSettleProposal(
  proposal: SettleProposal,
  expected: { operationId: string; objectId: string; now: number },
  currentCustom: unknown,
  settle: SettleRules,
): SettleProposalCheck {
  if (
    proposal.operationId !== expected.operationId ||
    proposal.objectId !== expected.objectId ||
    proposal.expiresAt.getTime() <= expected.now ||
    proposal.action !== settle.action ||
    !isSettleActionName(proposal.action)
  ) {
    return { ok: false, reason: "proposal_rejected" };
  }
  const leaves = matchSettleTemplate(
    proposal.input,
    settle.inputTemplate,
    settle.targetStates,
  );
  if (!leaves) return { ok: false, reason: "proposal_rejected" };
  const changes: SettleFieldChange[] = [];
  for (const [field, value] of leaves) {
    const to = displayValue(value);
    if (to === null) return { ok: false, reason: "proposal_rejected" };
    const current = field.startsWith("custom.")
      ? readPath(currentCustom, field.slice("custom.".length))
      : undefined;
    changes.push({ field, from: displayValue(current), to });
  }
  return { ok: true, changes };
}

/** Canonical JSON the runtime hashes for a proposal. */
export function proposalHashInput(proposal: {
  objectId: string;
  action: string;
  input: Record<string, unknown>;
}) {
  return canonicalJson({
    object_id: proposal.objectId,
    action: proposal.action,
    input: proposal.input,
  });
}

const DECIMAL = /^(?:0|[1-9][0-9]{0,29})(?:\.[0-9]{1,18})?$/;
const CURRENCY = /^[A-Z]{3}$/;
const QUOTE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export function isDecimalAmount(value: unknown): value is string {
  return typeof value === "string" && DECIMAL.test(value);
}

export function isCurrencyCode(value: unknown): value is string {
  return typeof value === "string" && CURRENCY.test(value);
}

export function isQuoteVersion(value: unknown): value is string {
  return typeof value === "string" && QUOTE_VERSION.test(value);
}

/** Authoritative quote facts the host read from the runtime itself. */
export interface CaseQuote {
  caseId: string;
  quoteVersion: string;
  provider: string;
  /** Exact decimal string; never converted through a float. */
  amount: string;
  currency: string;
}

/** A typed, user-safe product-face failure; `code` is a contract error. */
export class ProductFaceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 0,
  ) {
    super(code);
    this.name = "ProductFaceError";
  }
}

export type SessionEndReason = "logout" | "expired" | "account_changed";

/** What the host's own confirmation dialog shows. Never face-supplied text. */
export type ProductFaceConfirmation =
  | { kind: "registration"; unit: ProgrammeUnitFacts }
  | {
      kind: "runtime";
      operation: RuntimeWriteOperation;
      product: { objectId: string; name: string };
      caseId?: string;
      quote?: CaseQuote;
    }
  | {
      kind: "settle";
      product: { objectId: string; name: string };
      action: SettleActionName;
      changes: SettleFieldChange[];
    };
