import "server-only";

import type { NextRequest } from "next/server";
import { readFaceAcceptance, type FaceAcceptance } from "@/api/face-acceptance";
import { sha256Hash } from "@/api/face-assertion";
import type { FaceJournal } from "@/api/face-journal";
import {
  runtimeRequestHash,
  transferRuntimeCall,
  type TransferRuntimeResult,
} from "@/api/face-runtime";
import {
  fail,
  mint,
  selectionMatches,
  type FaceOperationFailure,
  type FaceOperationResult,
} from "@/api/product-face-operations";
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
} from "@/app/_domain/product-face-journal";
import {
  isObjectId,
  isOperationId,
  type ProgrammeUnitFacts,
} from "@/app/_domain/product-face";
import {
  checkTransferProposal,
  isOfferId,
  parseTransferProposal,
  transferProposalHashInput,
  transferStepOfOperation,
  type TransferProposal,
  type TransferStep,
} from "@/app/_domain/product-face-transfer";

// contract r16 protectedTransfer.hostOperation, the holder's host side. The
// BFF reads the next reviewed step itself from the bound runtime (a trusted,
// server-to-server transfer.propose), checks it against the selected owned
// unit and the runtime-bound recipient, and after the holder's own execution
// verifies the step or reads its status. It never executes, never signs and
// never holds issuer authority. The reservation before any execution is
// submitTransfer (product-face-operations).

const CONTEXT_ID = /^[A-Za-z0-9_-]{16,64}$/;

/** A fresh operation id for one host-only runtime call (not a journal entry). */
function hostOperationId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

type HostCall =
  | { ok: false; failure: FaceOperationFailure }
  | { ok: true; journal: FaceJournal; result: TransferRuntimeResult };

/** One host-only runtime call: mint the holder's assertion, then call. */
async function hostCall(
  context: FaceRequestContext,
  request: NextRequest,
  journal: FaceJournal,
  call: {
    operation: "transfer.propose" | "transfer.verify" | "transfer.status";
    objectId: string;
    input: Record<string, unknown>;
  },
): Promise<HostCall> {
  const read = {
    operation: call.operation,
    operationId: hostOperationId(call.operation.slice("transfer.".length)),
    target: { object_id: call.objectId },
    input: call.input,
  };
  const minted = mint(context, request, journal, {
    operation: read.operation,
    operationId: read.operationId,
    target: read.target,
    requestHash: runtimeRequestHash(read),
  });
  if (!minted.ok) return { ok: false, failure: minted };
  return {
    ok: true,
    journal: minted.journal,
    result: await transferRuntimeCall(context.binding, read, minted.assertion),
  };
}

const REFUSALS: Record<string, string> = {
  transfer_not_accepted: "transfer_not_accepted",
  transfer_offer_cancelled: "transfer_cancelled",
  transfer_offer_expired: "transfer_cancelled",
  transfer_offer_not_found: "transfer_cancelled",
  transfer_step_reserved: "outcome_unknown",
};

/**
 * The next reviewed step of the holder's offer for the selected owned unit,
 * read by the wallet itself: the step, its proposal and the runtime-bound
 * recipient for the host's own native confirmation.
 */
export async function readTransferProposal(
  context: FaceRequestContext,
  request: NextRequest,
  body: Record<string, unknown>,
): Promise<FaceOperationResult<{ proposal: TransferProposal }>> {
  if (
    Object.keys(body).sort().join(",") !== "context_id,object_id,offer_id" ||
    !isObjectId(body.object_id) ||
    !isOfferId(body.offer_id) ||
    typeof body.context_id !== "string" ||
    !CONTEXT_ID.test(body.context_id)
  ) {
    return fail("invalid_request", 400);
  }
  // The request step's exact template (binding.transferRequest); without it
  // programme.product.transfer.sign is not granted (fail closed).
  const rules = context.binding.transferRequest;
  if (!rules) return fail("capability_not_granted", 403);
  if (
    !selectionMatches(context, context.journal, body.context_id, body.object_id)
  ) {
    return fail("stale_context", 409);
  }
  const owned = await readOwnedProduct(context, body.object_id);
  if (!owned.ok) {
    return fail(owned.code, owned.code === "session_expired" ? 401 : 403);
  }
  const call = await hostCall(context, request, context.journal, {
    operation: "transfer.propose",
    objectId: body.object_id,
    input: { offer_id: body.offer_id },
  });
  if (!call.ok) return call.failure;
  const { journal, result } = call;
  if (!result.ok || result.status !== 200) {
    const reason = result.ok ? undefined : (result.reason ?? result.detail);
    const unavailable = !result.ok && result.code === "runtime_unavailable";
    const code = unavailable
      ? "runtime_unavailable"
      : ((reason && REFUSALS[reason]) ?? "proposal_rejected");
    return { ...fail(code, unavailable ? 503 : 409), journal };
  }
  const proposal = parseTransferProposal(result.body);
  if (!proposal) return { ...fail("proposal_rejected", 422), journal };
  const check = checkTransferProposal(
    proposal,
    {
      offerId: body.offer_id,
      objectId: body.object_id,
      holder: context.holder,
      now: Date.now(),
      recipientReferenceHash: sha256Hash(proposal.recipient),
    },
    { currentCustom: owned.product.custom, rules },
  );
  const { readback } = productRegistration(context, owned.product);
  if (
    !check.ok ||
    (proposal.step === "request" &&
      (!readback.state || !rules.fromStates.includes(readback.state))) ||
    sha256Hash(transferProposalHashInput(proposal)) !== proposal.proposalHash
  ) {
    return { ...fail("proposal_rejected", 422), journal };
  }
  return { ok: true, proposal, journal };
}

const ACCEPTANCE_CLOSED = new Set([
  "transfer_offer_cancelled",
  "transfer_offer_expired",
  "transfer_offer_used",
  "transfer_offer_not_found",
]);

/**
 * Proposed r19, the recipient's host: the unit this launch's acceptance is
 * for, for the wallet's own transfer.accept confirmation. The BFF reads it
 * itself with the acceptance ticket it kept for this launch and session
 * (transfer.acceptance.read, server to server, the session's own assertion),
 * then names the unit from Dual's PUBLIC projection, in this programme only.
 * No ticket for this launch (any task but accept, a pasted link, another
 * session) names nothing. The answer carries the unit's own facts only: never
 * an owner address, a case or a document.
 */
export async function readAcceptOffer(
  context: FaceRequestContext,
  request: NextRequest,
  body: Record<string, unknown>,
): Promise<
  FaceOperationResult<{ unit: ProgrammeUnitFacts; acceptance: FaceAcceptance }>
> {
  if (Object.keys(body).length !== 0) return fail("invalid_request", 400);
  const kept = readFaceAcceptance(request, {
    slug: context.binding.slug,
    launchId: context.scope.launchId,
    owner: context.owner,
  });
  if (!kept) return fail("invalid_request", 400);
  const read = {
    operation: "transfer.acceptance.read" as const,
    operationId: hostOperationId("acc-read"),
    target: {},
    input: { acceptance_ticket: kept.ticket },
  };
  const minted = mint(context, request, context.journal, {
    operation: read.operation,
    operationId: read.operationId,
    target: read.target,
    requestHash: runtimeRequestHash(read),
  });
  if (!minted.ok) return minted;
  const { journal } = minted;
  const result = await transferRuntimeCall(
    context.binding,
    read,
    minted.assertion,
  );
  if (!result.ok || result.status !== 200) {
    if (!result.ok && result.code === "runtime_unavailable") {
      return { ...fail("runtime_unavailable", 503), journal };
    }
    const reason = result.ok ? undefined : result.reason;
    if (reason === "transfer_recipient_is_holder") {
      return { ...fail("already_registered_to_you", 409), journal };
    }
    if (reason && ACCEPTANCE_CLOSED.has(reason)) {
      return { ...fail("transfer_cancelled", 409), journal };
    }
    // The acceptance itself cannot be used (unknown, used, expired, unbound,
    // another binding): open the transfer link again.
    return { ...fail("invalid_request", 409), journal };
  }
  if (
    result.body.status !== "transfer_acceptance" ||
    !isObjectId(result.body.object_id)
  ) {
    return { ...fail("invalid_request", 409), journal };
  }
  const unit = await readPublicUnit(result.body.object_id);
  if (!unit) return { ...fail("not_found", 404), journal };
  const facts = publicUnitFacts(context, unit);
  if (
    facts.objectId !== result.body.object_id ||
    !context.binding.templateIds.includes(facts.templateId)
  ) {
    return { ...fail("not_in_programme", 404), journal };
  }
  if (facts.readback.ownerIsYou) {
    return { ...fail("already_registered_to_you", 409), journal };
  }
  return {
    ok: true,
    unit: facts,
    acceptance: { ...kept, objectId: facts.objectId },
    journal,
  };
}

export type TransferProgress =
  | {
      status: "transfer_request_committed" | "transferred";
      step: TransferStep;
    }
  | { status: "outcome_unknown"; step: TransferStep };

const committedStatus = (step: TransferStep) =>
  step === "request" ? "transfer_request_committed" : "transferred";

/**
 * After a submitted step: transfer.verify with the holder's recorded action,
 * else the runtime's read-only transfer.status. Never an execution; a
 * committed step settles the journal entry.
 */
export async function transferStepProgress(
  context: FaceRequestContext,
  request: NextRequest,
  body: Record<string, unknown>,
): Promise<FaceOperationResult<{ progress: TransferProgress }>> {
  if (
    Object.keys(body).join(",") !== "operation_id" ||
    !isOperationId(body.operation_id)
  ) {
    return fail("invalid_request", 400);
  }
  const entry = context.journal.entries.find(
    (item) =>
      item.operationId === body.operation_id &&
      item.slug === context.binding.slug,
  );
  const step = entry ? transferStepOfOperation(entry.operation) : undefined;
  if (!entry || entry.kind !== "transfer" || !step || !entry.offerId) {
    return fail("unknown_operation", 404);
  }
  if (!authorityLeft(entry.phase)) return fail("operation_conflict", 409);
  if (entry.phase === "settled") {
    return { ok: true, progress: { status: committedStatus(step), step } };
  }
  const verify = Boolean(entry.actionId);
  const call = await hostCall(context, request, context.journal, {
    operation: verify ? "transfer.verify" : "transfer.status",
    objectId: entry.objectId,
    input: verify
      ? {
          offer_id: entry.offerId,
          action_id: entry.actionId,
          step_operation_id: entry.operationId,
        }
      : { offer_id: entry.offerId, step_operation_id: entry.operationId },
  });
  if (!call.ok) return call.failure;
  const { journal, result } = call;
  const committed =
    result.ok &&
    result.status === 200 &&
    result.body.status === committedStatus(step);
  if (!committed) {
    return {
      ok: true,
      progress: { status: "outcome_unknown", step },
      journal,
    };
  }
  const settled = applyJournalTransition(
    journal.entries,
    // The step committed (the journal's own vocabulary for a done entry).
    { kind: "settle", operationId: entry.operationId, status: "registered" },
    Date.now(),
  );
  return {
    ok: true,
    progress: { status: committedStatus(step), step },
    journal: settled.ok ? { ...journal, entries: settled.entries } : journal,
  };
}
