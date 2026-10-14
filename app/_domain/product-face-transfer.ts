// G8 protected transfer (contract r16 protectedTransfer): the wallet's pure
// rules for the holder's host operation programme.product.transfer.sign. The
// runtime proposes each reviewed holder-signed step (trusted, server to
// server); the wallet accepts it only when it is exactly the reviewed step for
// the selected owned unit and the runtime-bound recipient, never face-supplied.

import {
  canonicalJson,
  customPathOf,
  isObjectId,
  matchCompleteTemplate,
  type TransferRequestRules,
} from "@/app/_domain/product-face";

export const transferHostOperation = "programme.product.transfer.sign";

export const transferSteps = ["request", "transfer"] as const;
export type TransferStep = (typeof transferSteps)[number];

const OFFER_ID = /^pto-[0-9a-f]{24}$/;
const PROPOSAL_ID = /^ptp-[0-9a-f]{24}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
/** The request step's reviewed target state (Passport request_transfer). */
export const TRANSFER_PENDING_STATE = "Transfer pending";

export function isOfferId(value: unknown): value is string {
  return typeof value === "string" && OFFER_ID.test(value);
}

export function isTransferProposalId(value: unknown): value is string {
  return typeof value === "string" && PROPOSAL_ID.test(value);
}

export function isWalletAddress(value: unknown): value is string {
  return typeof value === "string" && ADDRESS.test(value);
}

/** The journal operation name of one transfer step. */
export function transferJournalOperation(step: TransferStep) {
  return `transfer.${step}`;
}

export function transferStepOfOperation(
  operation: string,
): TransferStep | undefined {
  return operation === "transfer.request"
    ? "request"
    : operation === "transfer.transfer"
      ? "transfer"
      : undefined;
}

/** A transfer step proposal the wallet read itself from the bound runtime. */
export interface TransferProposal {
  step: TransferStep;
  proposalId: string;
  offerId: string;
  objectId: string;
  action: "update" | "transfer";
  input: Record<string, unknown>;
  proposalHash: string;
  expiresAt: Date;
  /** The recipient the runtime bound from the recipient's own assertion. */
  recipient: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Narrow projection of a transfer.propose answer. */
export function parseTransferProposal(
  body: Record<string, unknown>,
): TransferProposal | undefined {
  const expiresAt =
    typeof body.expires_at === "string" ? new Date(body.expires_at) : null;
  if (
    body.status !== "transfer_step_proposed" ||
    !transferSteps.includes(body.step as TransferStep) ||
    !isTransferProposalId(body.proposal_id) ||
    !isOfferId(body.offer_id) ||
    !isObjectId(body.object_id) ||
    (body.action !== "update" && body.action !== "transfer") ||
    !record(body.input) ||
    typeof body.proposal_hash !== "string" ||
    !HASH.test(body.proposal_hash) ||
    !isWalletAddress(body.recipient) ||
    !expiresAt ||
    Number.isNaN(expiresAt.getTime())
  ) {
    return undefined;
  }
  return {
    step: body.step as TransferStep,
    proposalId: body.proposal_id,
    offerId: body.offer_id,
    objectId: body.object_id,
    action: body.action,
    input: body.input,
    proposalHash: body.proposal_hash,
    expiresAt,
    recipient: body.recipient.toLowerCase(),
  };
}

export type TransferProposalCheck =
  { ok: true } | { ok: false; reason: "proposal_rejected" };

/**
 * The step is untrusted until it is exactly the reviewed one: this offer and
 * the selected owned unit, unexpired, the step's own action, and the
 * runtime-bound recipient (never the holder):
 * - request: the holder's own request_transfer update, exactly the
 *   deployment's `binding.transferRequest` template (the runtime's template
 *   inspection): every governed leaf passes its rule (literal, enum,
 *   unchanged against the host's fresh read, runtimeIssued format), and
 *   (contract r17 completeCustomMap) every other key of the host's fresh read
 *   is carried unchanged and nothing else is added. On top of it: the
 *   Transfer pending state and lifecycle target, and the recipient named by
 *   `recipientReferenceHash:<sha256 of the recipient>`. Without a complete-map
 *   template the request step is refused;
 * - transfer: the Dual transfer `{to: <recipient>}` and nothing else.
 * The proposal hash is checked separately by the caller.
 */
export function checkTransferProposal(
  proposal: TransferProposal,
  expected: {
    offerId: string;
    objectId: string;
    holder: string;
    now: number;
    /** sha256:<hex> of the recipient as the runtime hashes it. */
    recipientReferenceHash: string;
  },
  template: {
    /** The host's own fresh read of the unit's custom map. */
    currentCustom: unknown;
    rules: TransferRequestRules | null;
  },
): TransferProposalCheck {
  const reject = { ok: false as const, reason: "proposal_rejected" as const };
  if (
    proposal.offerId !== expected.offerId ||
    proposal.objectId !== expected.objectId ||
    proposal.expiresAt.getTime() <= expected.now ||
    proposal.recipient === expected.holder.toLowerCase()
  ) {
    return reject;
  }
  if (proposal.step === "transfer") {
    const input = proposal.input;
    return proposal.action === "transfer" &&
      Object.keys(input).join(",") === "to" &&
      typeof input.to === "string" &&
      input.to.toLowerCase() === proposal.recipient
      ? { ok: true }
      : reject;
  }
  const rules = template.rules;
  if (
    !rules ||
    rules.preserveUnlisted !== true ||
    proposal.action !== "update" ||
    proposal.action !== rules.action
  ) {
    return reject;
  }
  const data = proposal.input.data;
  if (
    Object.keys(proposal.input).join(",") !== "data" ||
    !record(data) ||
    Object.keys(data).join(",") !== "custom" ||
    !record(data.custom)
  ) {
    return reject;
  }
  const governed = matchCompleteTemplate(
    proposal.input,
    rules.leaves,
    template.currentCustom,
  );
  if (!governed) return reject;
  const written = new Map(
    governed.flatMap(([path, value]) => {
      const customPath = customPathOf(path);
      return customPath ? [[customPath, value] as const] : [];
    }),
  );
  const custom = data.custom;
  const lifecycle = record(custom.lifecycle) ? custom.lifecycle : {};
  const proof = record(custom.proof_event) ? custom.proof_event : {};
  const fields = Array.isArray(proof.public_fields) ? proof.public_fields : [];
  if (
    custom.state !== TRANSFER_PENDING_STATE ||
    lifecycle.target_state !== TRANSFER_PENDING_STATE ||
    written.get("state") !== custom.state ||
    !rules.targetStates.includes(TRANSFER_PENDING_STATE) ||
    (custom.dual_object_id !== undefined &&
      custom.dual_object_id !== expected.objectId) ||
    !fields.includes(
      `recipientReferenceHash:${expected.recipientReferenceHash}`,
    )
  ) {
    return reject;
  }
  return { ok: true };
}

/** Canonical JSON the runtime hashes for a transfer step proposal. */
export function transferProposalHashInput(proposal: TransferProposal) {
  return canonicalJson({
    object_id: proposal.objectId,
    action: proposal.action,
    input: proposal.input,
  });
}

/** The executor's form of a reviewed step: update -> {custom}; transfer -> {to}. */
export function transferExecutorInput(proposal: {
  action: string;
  input: Record<string, unknown>;
}): Record<string, unknown> | undefined {
  if (proposal.action === "transfer") {
    return typeof proposal.input.to === "string"
      ? { to: proposal.input.to }
      : undefined;
  }
  const data = proposal.input.data;
  return record(data) && record(data.custom)
    ? { custom: data.custom }
    : undefined;
}
