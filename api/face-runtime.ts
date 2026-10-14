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
export function runtimeRequestHash(request: TrustedReadRequest) {
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
    };

/**
 * Server-to-server read from the bound runtime for facts the HOST shows in its
 * own confirmations. Fixed endpoint, two allowlisted operations, bounded
 * response, timeout, no cookies and no redirects. Not a proxy: callers parse
 * a narrow projection and nothing else reaches the browser.
 */
export async function trustedRuntimeRead(
  binding: ProductFaceBinding,
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
    return {
      ok: false,
      code: response.status >= 500 ? "runtime_unavailable" : "runtime_refused",
      status: response.status,
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
