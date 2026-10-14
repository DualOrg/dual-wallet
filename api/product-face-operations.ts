import "server-only";

import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  mintFaceAssertion,
  sha256Hash,
  walletIssuerOrigin,
  faceAssertionSigner,
  type AssertionTarget,
} from "@/api/face-assertion";
import {
  currentSelection,
  MAX_OUTSTANDING_ASSERTIONS,
  withSelection,
  type FaceJournal,
} from "@/api/face-journal";
import {
  parseCaseQuote,
  parseSettleProposal,
  runtimeRequestHash,
  trustedRuntimeRead,
  type TrustedReadRequest,
} from "@/api/face-runtime";
import {
  productRegistration,
  publicUnitFacts,
  readOwnedProduct,
  readPublicUnit,
  type FaceRequestContext,
} from "@/api/product-face-server";
import {
  applyJournalTransition,
  authorityLeft,
  journalOperationStatus,
  type FaceJournalEntry,
  type JournalTransitionError,
} from "@/app/_domain/product-face-journal";
import {
  checkSettleProposal,
  isCaseId,
  isObjectId,
  isOperationId,
  isQuoteOperation,
  isRecordId,
  isRequestHash,
  isRuntimeOperation,
  isRuntimeWriteOperation,
  proposalHashInput,
  runtimeOperationNeedsCase,
  type CaseQuote,
  type ProgrammeProduct,
  type RuntimeOperation,
  type SettleFieldChange,
  type SettleProposal,
} from "@/app/_domain/product-face";

export type FaceOperationFailure = {
  ok: false;
  code: string;
  status: number;
  /** A failure after a mint still records the mint against the cap. */
  journal?: FaceJournal;
};
export type FaceOperationResult<T> =
  ({ ok: true; journal?: FaceJournal } & T) | FaceOperationFailure;

const fail = (code: string, status: number): FaceOperationFailure => ({
  ok: false,
  code,
  status,
});

const journalStatus: Record<JournalTransitionError, number> = {
  operation_already_submitted: 409,
  operation_conflict: 409,
  unknown_operation: 404,
  journal_full: 409,
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

const CONTEXT_ID = /^[A-Za-z0-9_-]{16,64}$/;
const ACTION_ID = /^[A-Za-z0-9._:-]{1,128}$/;

// In-process guard against two concurrent mints from the same journal state.
// ponytail: it holds within one instance; across instances the runtime's
// durable operationId idempotency and one-time jti are the backstop.
const issuing = new Map<string, number>();
function claimIssue(key: string, now: number) {
  for (const [candidate, until] of issuing) {
    if (until <= now) issuing.delete(candidate);
  }
  if (issuing.has(key)) return false;
  issuing.set(key, now + 10 * 60_000);
  return true;
}

export function resetIssueGuard() {
  issuing.clear();
}

function selectionMatches(
  context: FaceRequestContext,
  journal: FaceJournal,
  contextId: unknown,
  objectId: string,
) {
  const selection = currentSelection(journal, context.binding.slug);
  return (
    typeof contextId === "string" &&
    Boolean(selection) &&
    selection!.contextId === contextId &&
    selection!.objectId === objectId
  );
}

// ---------------------------------------------------------------- selection

export async function selectProduct(
  context: FaceRequestContext,
  body: Record<string, unknown>,
): Promise<
  FaceOperationResult<{
    contextId: string | null;
    product?: ProgrammeProduct;
  }>
> {
  if (!onlyKeys(body, ["object_id"])) return fail("invalid_request", 400);
  if (body.object_id === null) {
    return {
      ok: true,
      contextId: null,
      journal: withSelection(context.journal, {
        slug: context.binding.slug,
        cleared: true,
      }),
    };
  }
  if (!isObjectId(body.object_id)) return fail("invalid_request", 400);
  const owned = await readOwnedProduct(context, body.object_id);
  if (!owned.ok) {
    return fail(
      owned.code,
      owned.code === "session_expired"
        ? 401
        : owned.code === "not_owned"
          ? 403
          : 404,
    );
  }
  const contextId = randomBytes(18).toString("base64url");
  return {
    ok: true,
    contextId,
    product: owned.product,
    journal: withSelection(context.journal, {
      slug: context.binding.slug,
      objectId: owned.product.objectId,
      contextId,
      at: Date.now(),
    }),
  };
}

// ------------------------------------------------------------------ minting

interface MintRequest {
  operation: RuntimeOperation;
  operationId: string;
  target: AssertionTarget;
  requestHash: string;
}

/** Mints one assertion and records its expiry against the outstanding cap. */
function mint(
  context: FaceRequestContext,
  request: NextRequest,
  journal: FaceJournal,
  input: MintRequest,
):
  | { ok: true; assertion: string; expiresAt: number; journal: FaceJournal }
  | FaceOperationFailure {
  if (!faceAssertionSigner()) return fail("face_assertion_unprovisioned", 503);
  const issuer = walletIssuerOrigin(request);
  if (!issuer) return fail("invalid_origin", 403);
  const now = Date.now();
  const outstanding = journal.mints.filter((expiry) => expiry > now);
  if (outstanding.length >= MAX_OUTSTANDING_ASSERTIONS) {
    return fail("assertion_limit", 429);
  }
  const minted = mintFaceAssertion({
    issuer,
    binding: context.binding,
    walletId: context.wallet.id,
    holder: context.holder,
    operation: input.operation,
    operationId: input.operationId,
    target: input.target,
    requestHash: input.requestHash,
    sidHash: context.owner.sidHash,
    now,
  });
  if (!minted) return fail("face_assertion_unprovisioned", 503);
  return {
    ok: true,
    assertion: minted.assertion,
    expiresAt: minted.expiresAt,
    journal: { ...journal, mints: [...outstanding, minted.expiresAt] },
  };
}

function parseTarget(
  value: unknown,
  operation: RuntimeOperation,
): AssertionTarget | undefined {
  if (!record(value)) return undefined;
  const quote = isQuoteOperation(operation);
  const keys = quote
    ? ["object_id", "case_id", "quote_version", "amount", "currency"]
    : ["object_id", "case_id"];
  if (!onlyKeys(value, keys) || !isObjectId(value.object_id)) return undefined;
  const needsCase = runtimeOperationNeedsCase(operation);
  if (needsCase ? !isCaseId(value.case_id) : value.case_id !== undefined) {
    return undefined;
  }
  if (quote) {
    if (
      typeof value.quote_version !== "string" ||
      typeof value.amount !== "string" ||
      typeof value.currency !== "string"
    ) {
      return undefined;
    }
    return {
      object_id: value.object_id,
      case_id: value.case_id as string,
      quote_version: value.quote_version,
      amount: value.amount,
      currency: value.currency,
    };
  }
  return {
    object_id: value.object_id,
    ...(needsCase ? { case_id: value.case_id as string } : {}),
  };
}

const sameTarget = (left: AssertionTarget, right: AssertionTarget) =>
  JSON.stringify(left) === JSON.stringify(right);

/**
 * POST /api/faces/[slug]/assertions. Every path re-checks, server-side, the
 * session, the wallet, the journal and the current selection before minting;
 * after logout, account change or product switch nothing is minted for the
 * old context.
 */
export async function authorizeAssertion(
  context: FaceRequestContext,
  request: NextRequest,
  body: Record<string, unknown>,
): Promise<
  FaceOperationResult<{
    assertion: string;
    expiresAt: number;
    operationId: string;
  }>
> {
  if (
    !onlyKeys(body, [
      "operation",
      "operation_id",
      "target",
      "request_hash",
      "context_id",
    ]) ||
    !isRuntimeOperation(body.operation) ||
    !isOperationId(body.operation_id)
  ) {
    return fail("invalid_request", 400);
  }
  const operation = body.operation;
  const operationId = body.operation_id;
  const target = parseTarget(body.target, operation);
  if (!target?.object_id) return fail("invalid_request", 400);
  const objectId = target.object_id;
  let journal = context.journal;
  const entry = journal.entries.find(
    (item) => item.operationId === operationId,
  );

  if (operation === "registration.submit") {
    if (!isRequestHash(body.request_hash) || body.context_id !== undefined) {
      return fail("invalid_request", 400);
    }
    if (
      !entry ||
      entry.kind !== "registration" ||
      entry.slug !== context.binding.slug ||
      entry.objectId !== objectId
    ) {
      return fail("unknown_operation", 404);
    }
    // r6: the assertion binds the face's entire exact request. The hash the
    // user confirmed is carried unchanged; any other hash is refused.
    if (!entry.requestHash || entry.requestHash !== body.request_hash) {
      return fail("operation_conflict", 409);
    }
    if (authorityLeft(entry.phase)) {
      return fail("operation_already_submitted", 409);
    }
    if (!faceAssertionSigner())
      return fail("face_assertion_unprovisioned", 503);
    const transition = applyJournalTransition(
      journal.entries,
      { kind: "issue", operationId, objectId },
      Date.now(),
    );
    if (!transition.ok) {
      return fail(transition.error, journalStatus[transition.error]);
    }
    if (!claimIssue(`${context.owner.sidHash}:${operationId}`, Date.now())) {
      return fail("operation_already_submitted", 409);
    }
    journal = { ...journal, entries: transition.entries };
    const minted = mint(context, request, journal, {
      operation,
      operationId,
      target: { object_id: objectId },
      requestHash: entry.requestHash,
    });
    if (!minted.ok) return minted;
    return {
      ok: true,
      assertion: minted.assertion,
      expiresAt: minted.expiresAt,
      operationId,
      journal: minted.journal,
    };
  }

  if (!isRequestHash(body.request_hash)) return fail("invalid_request", 400);
  const requestHash = body.request_hash;

  if (operation === "registration.status") {
    if (body.context_id !== undefined) return fail("invalid_request", 400);
    if (
      !entry ||
      entry.kind !== "registration" ||
      entry.slug !== context.binding.slug ||
      entry.objectId !== objectId ||
      !authorityLeft(entry.phase)
    ) {
      return fail("unknown_operation", 404);
    }
  } else {
    // Product-scoped: the server-side selection must still be this product.
    if (!selectionMatches(context, journal, body.context_id, objectId)) {
      return fail("stale_context", 409);
    }
    const owned = await readOwnedProduct(context, objectId);
    if (!owned.ok) {
      return fail(owned.code, owned.code === "session_expired" ? 401 : 403);
    }
    if (operation === "registration.settle.verify") {
      const settled = journal.entries.some(
        (item) =>
          item.kind === "settle" &&
          item.slug === context.binding.slug &&
          item.objectId === objectId &&
          (item.phase === "submitted" || item.phase === "settled"),
      );
      if (!settled) return fail("settle_not_submitted", 409);
    }
    if (isRuntimeWriteOperation(operation)) {
      if (
        !entry ||
        entry.kind !== "runtime" ||
        entry.operation !== operation ||
        entry.slug !== context.binding.slug
      ) {
        return fail("unknown_operation", 404);
      }
      if (authorityLeft(entry.phase)) {
        return fail("operation_already_submitted", 409);
      }
      const confirmedTarget: AssertionTarget = {
        object_id: entry.objectId,
        ...(entry.caseId ? { case_id: entry.caseId } : {}),
        ...(entry.quote
          ? {
              quote_version: entry.quote.quoteVersion,
              amount: entry.quote.amount,
              currency: entry.quote.currency,
            }
          : {}),
      };
      if (!sameTarget(confirmedTarget, target)) {
        return fail(
          isQuoteOperation(operation) ? "quote_changed" : "operation_conflict",
          409,
        );
      }
      if (!faceAssertionSigner()) {
        return fail("face_assertion_unprovisioned", 503);
      }
      const transition = applyJournalTransition(
        journal.entries,
        { kind: "issue", operationId, objectId, caseId: entry.caseId },
        Date.now(),
      );
      if (!transition.ok) {
        return fail(transition.error, journalStatus[transition.error]);
      }
      if (!claimIssue(`${context.owner.sidHash}:${operationId}`, Date.now())) {
        return fail("operation_already_submitted", 409);
      }
      journal = { ...journal, entries: transition.entries };
    }
  }

  const minted = mint(context, request, journal, {
    operation,
    operationId,
    target,
    requestHash,
  });
  if (!minted.ok) return minted;
  return {
    ok: true,
    assertion: minted.assertion,
    expiresAt: minted.expiresAt,
    operationId,
    journal: minted.journal,
  };
}

// ---------------------------------------------------------- trusted reads

async function trustedRead(
  context: FaceRequestContext,
  request: NextRequest,
  journal: FaceJournal,
  read: TrustedReadRequest,
) {
  const minted = mint(context, request, journal, {
    operation: read.operation,
    operationId: read.operationId,
    target: read.target,
    requestHash: runtimeRequestHash(read),
  });
  if (!minted.ok) return minted;
  const result = await trustedRuntimeRead(
    context.binding,
    read,
    minted.assertion,
  );
  if (!result.ok) {
    // Only a few runtime refusals become a contract code for the face; the
    // rest stay a generic refusal.
    const code =
      read.operation === "case.read"
        ? result.status === 409
          ? "quote_changed"
          : result.code
        : result.reason === "settle_not_required"
          ? "settle_not_required"
          : result.code === "runtime_refused"
            ? "proposal_rejected"
            : result.code;
    return {
      ...fail(code, result.code === "runtime_unavailable" ? 503 : 409),
      journal: minted.journal,
    };
  }
  return { ok: true as const, body: result.body, journal: minted.journal };
}

/**
 * The host obtains the settle proposal itself from the bound runtime; a
 * face-supplied proposal is never accepted. It must be bound to this unit and
 * original operation, unexpired, template-exact and hash-consistent.
 */
export async function readSettleProposal(
  context: FaceRequestContext,
  request: NextRequest,
  body: Record<string, unknown>,
): Promise<
  FaceOperationResult<{
    proposal: SettleProposal;
    changes: SettleFieldChange[];
  }>
> {
  if (
    !onlyKeys(body, ["context_id", "operation_id", "object_id"]) ||
    !isOperationId(body.operation_id) ||
    !isObjectId(body.object_id) ||
    typeof body.context_id !== "string" ||
    !CONTEXT_ID.test(body.context_id)
  ) {
    return fail("invalid_request", 400);
  }
  const settle = context.binding.settle;
  if (!settle) return fail("proposal_rejected", 409);
  if (
    !selectionMatches(context, context.journal, body.context_id, body.object_id)
  ) {
    return fail("stale_context", 409);
  }
  const owned = await readOwnedProduct(context, body.object_id);
  if (!owned.ok) {
    return fail(owned.code, owned.code === "session_expired" ? 401 : 403);
  }
  const { readback } = productRegistration(context, owned.product);
  if (
    !readback.state ||
    !settle.fromStates.includes(readback.state) ||
    !context.binding.canonicalRegistration.unconfirmedStates.includes(
      readback.state,
    )
  ) {
    return fail("settle_not_required", 409);
  }
  const read = await trustedRead(context, request, context.journal, {
    operation: "registration.settle.propose",
    operationId: body.operation_id,
    target: { object_id: body.object_id },
    input: {},
  });
  if (!read.ok) return read;
  const proposal = parseSettleProposal(read.body);

  if (!proposal)
    return { ...fail("proposal_rejected", 422), journal: read.journal };
  const check = checkSettleProposal(
    proposal,
    {
      operationId: body.operation_id,
      objectId: body.object_id,
      now: Date.now(),
    },
    owned.product.custom,
    settle,
    context.binding.canonicalRegistration,
  );
  if (
    !check.ok ||
    sha256Hash(proposalHashInput(proposal)) !== proposal.proposalHash
  ) {
    return { ...fail("proposal_rejected", 422), journal: read.journal };
  }
  return {
    ok: true,
    proposal,
    changes: check.changes,
    journal: read.journal,
  };
}

// ---------------------------------------------------------------- journal

type JournalBody = Record<string, unknown>;

/**
 * POST /api/faces/[slug]/operations: moves one journal entry forward. The
 * journal is persisted outside the iframe before any assertion is minted or
 * any settle action is executed.
 */
export async function transitionOperation(
  context: FaceRequestContext,
  request: NextRequest,
  body: JournalBody,
): Promise<
  FaceOperationResult<{
    entry: FaceJournalEntry;
    unit?: ReturnType<typeof publicUnitFacts>;
    quote?: CaseQuote;
  }>
> {
  const transition = body.transition;
  if (
    !onlyKeys(body, [
      "transition",
      "operation_id",
      "kind",
      "operation",
      "object_id",
      "case_id",
      "context_id",
      "action_id",
      "proposal_id",
      "record_id",
      "request_hash",
    ]) ||
    !isOperationId(body.operation_id)
  ) {
    return fail("invalid_request", 400);
  }
  const operationId = body.operation_id;
  const now = Date.now();
  let journal = context.journal;
  const existing = journal.entries.find(
    (entry) => entry.operationId === operationId,
  );
  if (existing && existing.slug !== context.binding.slug) {
    return fail("operation_conflict", 409);
  }
  const apply = (
    next: Parameters<typeof applyJournalTransition>[1],
    extra: {
      unit?: ReturnType<typeof publicUnitFacts>;
      quote?: CaseQuote;
    } = {},
  ) => {
    const result = applyJournalTransition(journal.entries, next, now);
    if (!result.ok) return fail(result.error, journalStatus[result.error]);
    return {
      ok: true as const,
      entry: result.entry,
      journal: { ...journal, entries: result.entries },
      ...extra,
    };
  };

  switch (transition) {
    case "begin":
      break;
    case "cancel":
      return apply({ kind: "cancel", operationId });
    case "confirm": {
      if (!existing) return fail("unknown_operation", 404);
      const recheck = await recheckOperation(context, existing, body);
      if (recheck) return recheck;
      return apply({
        kind: "confirm",
        operationId,
        objectId: existing.objectId,
      });
    }
    case "submit": {
      if (!existing) return fail("unknown_operation", 404);
      const recheck = await recheckOperation(context, existing, body);
      if (recheck) return recheck;
      return apply({
        kind: "submit",
        operationId,
        objectId: existing.objectId,
      });
    }
    case "record_action":
      if (
        typeof body.action_id !== "string" ||
        !ACTION_ID.test(body.action_id)
      ) {
        return fail("invalid_request", 400);
      }
      return apply({
        kind: "record_action",
        operationId,
        actionId: body.action_id,
      });
    default:
      return fail("invalid_request", 400);
  }

  // begin
  if (!isObjectId(body.object_id)) return fail("invalid_request", 400);
  const objectId = body.object_id;
  const base = {
    operationId,
    slug: context.binding.slug,
    programmeId: context.binding.programmeId,
    objectId,
  };

  if (body.kind === "registration") {
    if (
      body.operation !== "registration.submit" ||
      body.case_id !== undefined ||
      body.context_id !== undefined ||
      !isRecordId(body.record_id) ||
      !isRequestHash(body.request_hash)
    ) {
      return fail("invalid_request", 400);
    }
    const unit = await readPublicUnit(objectId);
    if (!unit) return fail("not_found", 404);
    const facts = publicUnitFacts(context, unit);
    if (!context.binding.templateIds.includes(facts.templateId)) {
      return fail("not_in_programme", 404);
    }
    if (facts.recordId !== body.record_id) {
      return fail("record_mismatch", 409);
    }
    if (facts.readback.ownerIsYou) {
      return fail(
        facts.registration === "registered"
          ? "already_registered_to_you"
          : "ownership_moved_state_pending",
        409,
      );
    }
    return apply(
      {
        kind: "begin",
        entry: {
          ...base,
          kind: "registration",
          operation: "registration.submit",
          recordId: body.record_id,
          requestHash: body.request_hash,
        },
      },
      { unit: facts },
    );
  }

  if (!selectionMatches(context, journal, body.context_id, objectId)) {
    return fail("stale_context", 409);
  }
  const owned = await readOwnedProduct(context, objectId);
  if (!owned.ok) {
    return fail(owned.code, owned.code === "session_expired" ? 401 : 403);
  }

  if (body.kind === "runtime") {
    if (!isRuntimeWriteOperation(body.operation)) {
      return fail("invalid_request", 400);
    }
    const operation = body.operation;
    const needsCase = runtimeOperationNeedsCase(operation);
    if (needsCase ? !isCaseId(body.case_id) : body.case_id !== undefined) {
      return fail("invalid_request", 400);
    }
    const caseId = needsCase ? (body.case_id as string) : undefined;
    let quote: CaseQuote | undefined;
    if (isQuoteOperation(operation)) {
      // The quote shown in the host confirmation and bound into the write
      // assertion comes from the runtime, read by the wallet itself.
      const read = await trustedRead(context, request, journal, {
        operation: "case.read",
        operationId,
        target: { object_id: objectId, case_id: caseId },
        input: {},
      });
      if (!read.ok) return read;
      journal = read.journal;
      quote = parseCaseQuote(read.body, caseId!);
      if (!quote) return { ...fail("quote_unavailable", 502), journal };
    }
    return apply(
      {
        kind: "begin",
        entry: {
          ...base,
          kind: "runtime",
          operation,
          ...(caseId ? { caseId } : {}),
          ...(quote
            ? {
                quote: {
                  quoteVersion: quote.quoteVersion,
                  amount: quote.amount,
                  currency: quote.currency,
                },
              }
            : {}),
        },
      },
      { quote },
    );
  }

  if (body.kind === "settle") {
    const settle = context.binding.settle;
    if (
      !settle ||
      body.operation !== settle.action ||
      body.case_id !== undefined ||
      typeof body.proposal_id !== "string" ||
      !ACTION_ID.test(body.proposal_id)
    ) {
      return fail("invalid_request", 400);
    }
    const { readback } = productRegistration(context, owned.product);
    if (!readback.state || !settle.fromStates.includes(readback.state)) {
      return fail("settle_not_required", 409);
    }
    return apply({
      kind: "begin",
      entry: {
        ...base,
        kind: "settle",
        operation: settle.action,
        proposalId: body.proposal_id,
      },
    });
  }

  return fail("invalid_request", 400);
}

/** Confirmation and submission re-check the facts that justified them. */
async function recheckOperation(
  context: FaceRequestContext,
  entry: FaceJournalEntry,
  body: JournalBody,
): Promise<FaceOperationFailure | undefined> {
  if (entry.kind === "registration") {
    const unit = await readPublicUnit(entry.objectId);
    if (!unit) return fail("not_found", 404);
    const facts = publicUnitFacts(context, unit);
    if (!context.binding.templateIds.includes(facts.templateId)) {
      return fail("not_in_programme", 404);
    }
    if (facts.readback.ownerIsYou) {
      return fail("already_registered_to_you", 409);
    }
    return undefined;
  }
  if (
    !selectionMatches(context, context.journal, body.context_id, entry.objectId)
  ) {
    return fail("stale_context", 409);
  }
  const owned = await readOwnedProduct(context, entry.objectId);
  if (!owned.ok) {
    return fail(owned.code, owned.code === "session_expired" ? 401 : 403);
  }
  if (entry.kind === "settle") {
    const settle = context.binding.settle;
    const { readback } = productRegistration(context, owned.product);
    if (
      !settle ||
      !readback.state ||
      !settle.fromStates.includes(readback.state)
    ) {
      return fail("settle_not_required", 409);
    }
  }
  return undefined;
}

// ------------------------------------------------------------------ status

/**
 * Read-only reconciliation from the journal and the wallet's own canonical
 * readback. It never retries, re-mints or re-executes.
 */
export async function reconcileOperation(
  context: FaceRequestContext,
  operationId: string,
) {
  const entry = context.journal.entries.find(
    (item) =>
      item.operationId === operationId && item.slug === context.binding.slug,
  );
  if (!entry) return fail("unknown_operation", 404);
  let readback: { ownerIsYou: boolean; state: string | null } | undefined;
  let evaluation:
    ReturnType<typeof publicUnitFacts>["registration"] | undefined;
  if (authorityLeft(entry.phase) && entry.kind !== "runtime") {
    const unit = await readPublicUnit(entry.objectId);
    if (unit) {
      const facts = publicUnitFacts(context, unit);
      readback = {
        ownerIsYou: facts.readback.ownerIsYou,
        state: facts.readback.state,
      };
      evaluation = facts.registration;
    }
  }
  const status = journalOperationStatus(entry, evaluation);
  let journal: FaceJournal | undefined;
  if (status === "registered" && entry.phase !== "settled") {
    const settled = applyJournalTransition(
      context.journal.entries,
      { kind: "settle", operationId, status },
      Date.now(),
    );
    if (settled.ok) journal = { ...context.journal, entries: settled.entries };
  }
  return {
    ok: true as const,
    entry,
    status,
    readback,
    journal,
  };
}
