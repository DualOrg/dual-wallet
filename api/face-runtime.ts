import "server-only";

import { fetchBounded } from "@/api/face-artifact";
import { sha256Hash, type AssertionTarget } from "@/api/face-assertion";
import type { ProductFaceBinding } from "@/api/product-face-binding";
import {
  canonicalJson,
  isCaseId,
  isCurrencyCode,
  isDecimalAmount,
  isObjectId,
  isOperationId,
  isQuoteVersion,
  isRequestHash,
  type CaseQuote,
  type SettleProposal,
  type TrustedRuntimeRead,
} from "@/app/_domain/product-face";

/** Bound on any runtime answer (a settle or transfer proposal included). */
export const MAX_RESPONSE_BYTES = 64 * 1024;
const TIMEOUT_MS = 8_000;
const RUNTIME_ENDPOINT = "/api/product-face/v1/operations";
const REGISTRATION_STATUS_ENDPOINT =
  "/api/product-face/v1/registrations/status";
const PROPOSAL_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export interface TrustedReadRequest {
  operation: TrustedRuntimeRead;
  operationId: string;
  target: AssertionTarget;
  input: Record<string, unknown>;
}

/** sha256 of the canonical runtime request body, excluding the assertion. */
export function runtimeRequestHash(request: {
  operation: string;
  operationId: string;
  target: AssertionTarget;
  input: Record<string, unknown>;
}) {
  return sha256Hash(
    canonicalJson({
      operation: request.operation,
      operationId: request.operationId,
      target: request.target,
      input: request.input,
    }),
  );
}

export type TrustedReadResult =
  | { ok: true; body: Record<string, unknown> }
  | {
      ok: false;
      code: "runtime_unavailable" | "runtime_refused";
      status?: number;
      /** The runtime's refusal status when it is a plain code. */
      reason?: string;
      /** The runtime's stated reason for that refusal, when a plain code. */
      detail?: string;
    };

/**
 * Server-to-server read from the bound runtime for facts the HOST shows in its
 * own confirmations. Fixed endpoint, two allowlisted operations, bounded
 * response, timeout, no cookies and no redirects. Not a proxy: callers parse
 * a narrow projection and nothing else reaches the browser.
 */
export async function trustedRuntimeRead(
  binding: Pick<ProductFaceBinding, "origin" | "applicationId">,
  request: TrustedReadRequest,
  assertion: string,
): Promise<TrustedReadResult> {
  if (
    request.operation !== "registration.settle.propose" &&
    request.operation !== "case.read"
  ) {
    return { ok: false, code: "runtime_refused" };
  }
  const response = await fetchBounded(
    `${binding.origin}${RUNTIME_ENDPOINT}`,
    MAX_RESPONSE_BYTES,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        // Routes the call when several applications share one runtime origin.
        "x-tig-product-face-application": binding.applicationId,
      },
      body: JSON.stringify({
        operation: request.operation,
        operationId: request.operationId,
        target: request.target,
        input: request.input,
        assertion,
      }),
    },
    TIMEOUT_MS,
  );
  if (!response) return { ok: false, code: "runtime_unavailable" };
  if (response.status !== 200) {
    let reason: string | undefined;
    let detail: string | undefined;
    const plainCode = (value: unknown) =>
      typeof value === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(value)
        ? value
        : undefined;
    try {
      const refused = JSON.parse(response.body.toString("utf8")) as {
        status?: unknown;
        reason?: unknown;
      };
      reason = plainCode(refused.status);
      detail = plainCode(refused.reason);
    } catch {
      // No readable refusal code.
    }
    return {
      ok: false,
      code: response.status >= 500 ? "runtime_unavailable" : "runtime_refused",
      status: response.status,
      ...(reason ? { reason } : {}),
      ...(detail ? { detail } : {}),
    };
  }
  try {
    const body: unknown = JSON.parse(response.body.toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false, code: "runtime_refused" };
    }
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false, code: "runtime_refused" };
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** The registrations/status body the face sends, hashed whole (r6). */
export function registrationStatusRequestHash(operationId: string) {
  return sha256Hash(canonicalJson({ operationId }));
}

export type RegistrationRuntimeStatus =
  /**
   * 404 face_operation_not_found for exactly this operation: the runtime
   * holds no journal for it (it records one before any dispatch).
   */
  | { outcome: "not_found" }
  /** The runtime's own journal for this operation answered this status. */
  | { outcome: "answered"; status: string }
  /** Anything else: unreachable, refused, unreadable. Proves nothing. */
  | { outcome: "unknown" };

/**
 * The host's own read-only registration status for ONE operation, server to
 * server: the same registrations/status read (and the same registration.status
 * assertion) the face makes on Check status. Fixed endpoint, bounded response,
 * timeout, no cookies and no redirects; it reconciles and never dispatches.
 */
export async function readRegistrationStatus(
  binding: Pick<ProductFaceBinding, "origin" | "applicationId">,
  operationId: string,
  assertion: string,
): Promise<RegistrationRuntimeStatus> {
  let response: Awaited<ReturnType<typeof fetchBounded>>;
  try {
    response = await fetchBounded(
      `${binding.origin}${REGISTRATION_STATUS_ENDPOINT}`,
      MAX_RESPONSE_BYTES,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-tig-product-face-application": binding.applicationId,
        },
        body: JSON.stringify({ operationId, assertion }),
      },
      TIMEOUT_MS,
    );
  } catch {
    return { outcome: "unknown" };
  }
  if (!response) return { outcome: "unknown" };
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(response.body.toString("utf8"));
    if (record(parsed)) body = parsed;
  } catch {
    return { outcome: "unknown" };
  }
  if (body.operationId !== operationId) return { outcome: "unknown" };
  if (
    response.status === 404 &&
    body.status === "not_submitted" &&
    body.reason === "face_operation_not_found"
  ) {
    return { outcome: "not_found" };
  }
  if (
    (response.status === 200 || response.status === 202) &&
    typeof body.status === "string" &&
    /^[a-z][a-z0-9_]{0,63}$/.test(body.status)
  ) {
    return { outcome: "answered", status: body.status };
  }
  return { outcome: "unknown" };
}

/** The request one write.status read sends, so its hash is the runtime's. */
export function writeStatusRequest(
  operationId: string,
  target: { object_id: string; case_id?: string },
) {
  return {
    operation: "write.status" as const,
    operationId,
    target: {
      object_id: target.object_id,
      ...(target.case_id ? { case_id: target.case_id } : {}),
    },
    input: {},
  };
}

/** The runtime's durable record of one write, exactly as it answered it. */
export interface RecordedWrite {
  operationId: string;
  operation: string;
  objectId: string;
  caseId: string | null;
  requestHash: string;
  holder: string;
  wallet: string;
  issuer: string;
  applicationId: string;
  programme: string;
  /** The face artifact the original write's assertion carried. */
  recordedArtifact: { version: string; artifactHash: string };
  /** The face artifact this status read's assertion carried. */
  assertingArtifact: { version: string; artifactHash: string };
  receipt:
    | { kind: "case_event"; caseId: string; eventId: string }
    | { kind: "transfer_offer"; offerId: string; state: string };
}

export type WriteStatusResult =
  /**
   * 200 write_applied under contract r20: the runtime's own readback of its
   * canonical store shows the original write's effect, with zero unresolved
   * outcomes, and every field is well formed.
   */
  | { outcome: "applied"; record: RecordedWrite }
  /**
   * Anything else: not found, refused, unknown, another caller, a runtime
   * without r20, an incompatible artifact, malformed, oversized, unreachable
   * or timed out. Proves nothing; the entry stays held, nothing is re-sent.
   */
  | { outcome: "held" };

const PLAIN = /^[a-z][a-z0-9_]{0,63}$/;
const SEMVER_TEXT = /^\d+\.\d+\.\d+$/;
const ARTIFACT_HASH = /^sha256:[0-9a-f]{64}$/;
const RECEIPT_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const OFFER = /^pto-[0-9a-f]{24}$/;

function artifactOf(value: unknown) {
  return record(value) &&
    typeof value.version === "string" &&
    SEMVER_TEXT.test(value.version) &&
    typeof value.artifactHash === "string" &&
    ARTIFACT_HASH.test(value.artifactHash)
    ? { version: value.version, artifactHash: value.artifactHash }
    : undefined;
}

function receiptOf(value: unknown): RecordedWrite["receipt"] | undefined {
  if (!record(value)) return undefined;
  if (
    value.kind === "case_event" &&
    isCaseId(value.case_id) &&
    typeof value.event_id === "string" &&
    RECEIPT_ID.test(value.event_id)
  ) {
    return {
      kind: "case_event",
      caseId: value.case_id,
      eventId: value.event_id,
    };
  }
  if (
    value.kind === "transfer_offer" &&
    typeof value.offer_id === "string" &&
    OFFER.test(value.offer_id) &&
    typeof value.state === "string" &&
    PLAIN.test(value.state)
  ) {
    return {
      kind: "transfer_offer",
      offerId: value.offer_id,
      state: value.state,
    };
  }
  return undefined;
}

/**
 * PROPOSED r20 (docs/proposals/runtime-write-status-r20.md), NOT deployed by
 * any runtime: the host's own read of ONE runtime write's verified outcome, by
 * its original operation id, from the runtime that served that write. Fixed
 * endpoint, bounded response, timeout, no cookies and no redirects; it reads
 * and never dispatches. Only an exact r20 write_applied answer with a
 * verified readback, zero unresolved outcomes, a receipt and the runtime's
 * artifact-compatibility proof is returned; the caller still compares every
 * binding with its journal entry, session, host and face binding.
 */
export async function readWriteStatus(
  runtime: Pick<ProductFaceBinding, "origin" | "applicationId">,
  request: ReturnType<typeof writeStatusRequest>,
  assertion: string,
): Promise<WriteStatusResult> {
  const held = { outcome: "held" } as const;
  let response: Awaited<ReturnType<typeof fetchBounded>>;
  try {
    response = await fetchBounded(
      `${runtime.origin}${RUNTIME_ENDPOINT}`,
      MAX_RESPONSE_BYTES,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-tig-product-face-application": runtime.applicationId,
        },
        body: JSON.stringify({ ...request, assertion }),
      },
      TIMEOUT_MS,
    );
  } catch {
    return held;
  }
  if (!response || response.status !== 200) return held;
  let body: unknown;
  try {
    body = JSON.parse(response.body.toString("utf8"));
  } catch {
    return held;
  }
  if (
    !record(body) ||
    body.ok !== true ||
    body.status !== "write_applied" ||
    body.contract !== "r20" ||
    body.readback !== "verified" ||
    body.artifact_compatible !== true ||
    body.unknownWriteOutcomes !== 0 ||
    body.secretReturned !== false ||
    !record(body.target)
  ) {
    return held;
  }
  const target = body.target;
  const text = (value: unknown, max = 256): value is string =>
    typeof value === "string" && value.length > 0 && value.length <= max;
  const recordedArtifact = artifactOf(body.recorded_artifact);
  const assertingArtifact = artifactOf(body.asserting_artifact);
  const receipt = receiptOf(body.receipt);
  if (
    !isOperationId(body.operation_id) ||
    !text(body.operation, 64) ||
    !isObjectId(target.object_id) ||
    (target.case_id !== undefined && !isCaseId(target.case_id)) ||
    !isRequestHash(body.request_hash) ||
    !text(body.holder) ||
    !text(body.wallet) ||
    !text(body.issuer) ||
    !text(body.application_id) ||
    !text(body.programme) ||
    !recordedArtifact ||
    !assertingArtifact ||
    !receipt
  ) {
    return held;
  }
  return {
    outcome: "applied",
    record: {
      operationId: body.operation_id,
      operation: body.operation,
      objectId: target.object_id,
      caseId: (target.case_id as string | undefined) ?? null,
      requestHash: body.request_hash,
      holder: body.holder,
      wallet: body.wallet,
      issuer: body.issuer,
      applicationId: body.application_id,
      programme: body.programme,
      recordedArtifact,
      assertingArtifact,
      receipt,
    },
  };
}

export type SettleReserveResult =
  /** This request alone created the runtime's durable dispatch claim. */
  | { outcome: "won" }
  /**
   * Anything else: an idempotent replay or already_claimed, already_reserved,
   * a refusal, an error, a timeout or a lost response. Never execute; only
   * the read-only registration.settle.status may follow.
   */
  | {
      outcome: "not_won";
      status: string | null;
      reason: string | null;
      reached: boolean;
    };

/**
 * contract r8/r11: before ANY holder execution, the wallet BFF reserves the
 * settle at the bound runtime, server to server. The holder action may run
 * only on a response this request received itself that answers
 * dispatch:"won" for exactly this proposal, operation and unit — the single
 * call that atomically created the reservation. The wallet's cookie and
 * process state are not part of that decision.
 */
export async function reserveSettle(
  binding: ProductFaceBinding,
  request: { settleOperationId: string; objectId: string; proposalId: string },
  assertion: string,
): Promise<SettleReserveResult> {
  const lost = {
    outcome: "not_won" as const,
    status: null,
    reason: null,
    reached: false,
  };
  let response: Awaited<ReturnType<typeof fetchBounded>>;
  try {
    response = await fetchBounded(
      `${binding.origin}${RUNTIME_ENDPOINT}`,
      MAX_RESPONSE_BYTES,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-tig-product-face-application": binding.applicationId,
        },
        body: JSON.stringify({
          operation: "registration.settle.reserve",
          operationId: request.settleOperationId,
          target: { object_id: request.objectId },
          input: { proposal_id: request.proposalId },
          assertion,
        }),
      },
      TIMEOUT_MS,
    );
  } catch {
    return lost;
  }
  if (!response) return lost;
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(response.body.toString("utf8"));
    if (record(parsed)) body = parsed;
  } catch {
    // An unreadable answer is not a win.
  }
  const code = (value: unknown) =>
    typeof value === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(value)
      ? value
      : null;
  const reservation = record(body.reservation) ? body.reservation : {};
  const won =
    response.status === 200 &&
    body.ok === true &&
    body.status === "granted" &&
    body.dispatch === "won" &&
    body.idempotent !== true &&
    reservation.settle_operation_id === request.settleOperationId &&
    reservation.object_id === request.objectId &&
    reservation.proposal_id === request.proposalId;
  if (won) return { outcome: "won" };
  return {
    outcome: "not_won",
    status:
      code(body.dispatch) === "already_claimed"
        ? "already_claimed"
        : code(body.status),
    reason: code(body.reason),
    reached: true,
  };
}

export interface TransferRuntimeRequest {
  operation:
    | "transfer.propose"
    | "transfer.reserve"
    | "transfer.verify"
    | "transfer.status"
    // r19: the recipient's host reads which unit its acceptance is for.
    | "transfer.acceptance.read";
  operationId: string;
  target: AssertionTarget;
  input: Record<string, unknown>;
}

export type TransferRuntimeResult =
  | { ok: true; status: number; body: Record<string, unknown> }
  | {
      ok: false;
      code: "runtime_unavailable" | "runtime_refused";
      status?: number;
      /** The runtime's plain refusal codes (status, reason). */
      reason?: string;
      detail?: string;
      /** The runtime's answer, when readable (never shown to the face). */
      body?: Record<string, unknown>;
    };

/**
 * G8 (contract r16 transfer.sign): one of the holder's host's own
 * server-to-server transfer calls to the bound runtime, or the recipient's
 * host reading which unit its acceptance is for (transfer.acceptance.read,
 * r19). Fixed endpoint, five allowlisted operations, bounded
 * response, timeout, no cookies and no redirects. A 202 (an outcome not yet
 * known) is an answer, not a failure.
 */
export async function transferRuntimeCall(
  binding: Pick<ProductFaceBinding, "origin" | "applicationId">,
  request: TransferRuntimeRequest,
  assertion: string,
): Promise<TransferRuntimeResult> {
  if (
    ![
      "transfer.propose",
      "transfer.reserve",
      "transfer.verify",
      "transfer.status",
      "transfer.acceptance.read",
    ].includes(request.operation)
  ) {
    return { ok: false, code: "runtime_refused" };
  }
  let response: Awaited<ReturnType<typeof fetchBounded>>;
  try {
    response = await fetchBounded(
      `${binding.origin}${RUNTIME_ENDPOINT}`,
      MAX_RESPONSE_BYTES,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-tig-product-face-application": binding.applicationId,
        },
        body: JSON.stringify({
          operation: request.operation,
          operationId: request.operationId,
          target: request.target,
          input: request.input,
          assertion,
        }),
      },
      TIMEOUT_MS,
    );
  } catch {
    return { ok: false, code: "runtime_unavailable" };
  }
  if (!response) return { ok: false, code: "runtime_unavailable" };
  let body: Record<string, unknown> | undefined;
  try {
    const parsed: unknown = JSON.parse(response.body.toString("utf8"));
    if (record(parsed)) body = parsed;
  } catch {
    body = undefined;
  }
  const plainCode = (value: unknown) =>
    typeof value === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(value)
      ? value
      : undefined;
  if ((response.status === 200 || response.status === 202) && body) {
    return { ok: true, status: response.status, body };
  }
  const reason = plainCode(body?.status);
  const detail = plainCode(body?.reason);
  return {
    ok: false,
    code: response.status >= 500 ? "runtime_unavailable" : "runtime_refused",
    status: response.status,
    ...(reason ? { reason } : {}),
    ...(detail ? { detail } : {}),
    ...(body ? { body } : {}),
  };
}

/** Narrow projection of a registration.settle.propose result. */
export function parseSettleProposal(
  body: Record<string, unknown>,
): SettleProposal | undefined {
  const value = record(body.proposal) ? body.proposal : body;
  const expiresAt =
    typeof value.expires_at === "string" ? new Date(value.expires_at) : null;
  if (
    typeof value.proposal_id !== "string" ||
    !PROPOSAL_ID.test(value.proposal_id) ||
    !isOperationId(value.operation_id) ||
    !isObjectId(value.object_id) ||
    typeof value.action !== "string" ||
    !record(value.input) ||
    !isRequestHash(value.proposal_hash) ||
    !expiresAt ||
    Number.isNaN(expiresAt.getTime())
  ) {
    return undefined;
  }
  return {
    proposalId: value.proposal_id,
    operationId: value.operation_id,
    objectId: value.object_id,
    action: value.action,
    input: value.input,
    proposalHash: value.proposal_hash,
    expiresAt,
  };
}

/** Narrow projection of the quote in a case.read result. */
export function parseCaseQuote(
  body: Record<string, unknown>,
  caseId: string,
): CaseQuote | undefined {
  const container = record(body.case) ? body.case : body;
  const quote = record(container.quote) ? container.quote : undefined;
  const readCaseId =
    typeof container.case_id === "string" ? container.case_id : caseId;
  if (
    !quote ||
    !isCaseId(readCaseId) ||
    readCaseId !== caseId ||
    !isQuoteVersion(quote.quote_version) ||
    typeof quote.provider !== "string" ||
    !quote.provider.trim() ||
    quote.provider.length > 120 ||
    !isDecimalAmount(quote.amount) ||
    !isCurrencyCode(quote.currency)
  ) {
    return undefined;
  }
  return {
    caseId,
    quoteVersion: quote.quote_version,
    provider: quote.provider,
    amount: quote.amount,
    currency: quote.currency,
  };
}
