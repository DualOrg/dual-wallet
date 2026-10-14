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

const MAX_RESPONSE_BYTES = 64 * 1024;
const TIMEOUT_MS = 8_000;
const RUNTIME_ENDPOINT = "/api/product-face/v1/operations";
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
    | "transfer.status";
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
 * server-to-server transfer calls to the bound runtime. Fixed endpoint, four
 * allowlisted operations, bounded response, timeout, no cookies and no
 * redirects. A 202 (an outcome not yet known) is an answer, not a failure.
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
