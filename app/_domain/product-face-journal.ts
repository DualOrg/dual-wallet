import {
  isCaseId,
  isObjectId,
  isRecordId,
  isRequestHash,
  isOperationId,
  isRegistrationStatus,
  isRuntimeOperation,
  type RegistrationStatus,
} from "@/app/_domain/product-face";

// The operation journal records, outside the iframe, what the wallet has
// confirmed and what authority it has already issued. It holds only
// non-secret facts: no assertion, signature, token or face-supplied text.

export const journalKinds = [
  "registration",
  "runtime",
  "settle",
  // G8: one holder-signed transfer step (contract r16 transfer.sign).
  "transfer",
] as const;
export type JournalKind = (typeof journalKinds)[number];

export const journalPhases = [
  "confirming",
  "confirmed",
  "assertion_issued",
  "submitted",
  "settled",
  "cancelled",
  // A registration this launch did not submit, whose binding to its unit the
  // runtime itself vouched for (a trusted settle proposal read): reconciled
  // read-only, never minted, submitted or cancelled from here.
  "observed",
] as const;
export type JournalPhase = (typeof journalPhases)[number];

export interface FaceJournalEntry {
  operationId: string;
  kind: JournalKind;
  /** Runtime operation name, or the standard action for a settle. */
  operation: string;
  slug: string;
  programmeId: string;
  objectId: string;
  caseId?: string;
  phase: JournalPhase;
  status?: RegistrationStatus;
  actionId?: string;
  /** The face's exact runtime registration request, bound at confirmation. */
  recordId?: string;
  requestHash?: string;
  /** The runtime proposal a settle executes; its id only, never its input. */
  proposalId?: string;
  /** G8: the transfer offer a transfer step belongs to (its id only). */
  offerId?: string;
  /**
   * The host-read quote a quote approval or decline is bound to, as a hash of
   * its {quote_version, amount, currency}; never the quote itself.
   */
  quoteHash?: string;
  /**
   * contract r17: a settle or transfer request step is bound at begin to the
   * host's own fresh read of the unit's custom map, as a hash of its
   * canonical JSON; confirmation and submission refuse if the unit changed
   * since (a complete-map update would otherwise drop the new key).
   */
  freshHash?: string;
  createdAt: number;
  updatedAt: number;
  issuedAt?: number;
}

/**
 * Entries one launch journal holds. The journal is per launch (one frame), so
 * it stays a small cookie; finished entries make room for new ones.
 */
export const JOURNAL_MAX_ENTRIES = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;
const PROGRAMME = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const ACTION_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const OPERATION = /^[a-z_][a-z0-9_.]{1,63}$/;
const OFFER_ID = /^pto-[0-9a-f]{24}$/;
const TRANSFER_OPERATIONS = ["transfer.request", "transfer.transfer"];

function timestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Strict re-validation of an entry read back from the sealed cookie. */
export function parseJournalEntry(
  value: unknown,
): FaceJournalEntry | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const entry = value as Record<string, unknown>;
  if (
    !isOperationId(entry.operationId) ||
    !journalKinds.includes(entry.kind as JournalKind) ||
    typeof entry.operation !== "string" ||
    !OPERATION.test(entry.operation) ||
    typeof entry.slug !== "string" ||
    !SLUG.test(entry.slug) ||
    typeof entry.programmeId !== "string" ||
    !PROGRAMME.test(entry.programmeId) ||
    !isObjectId(entry.objectId) ||
    (entry.caseId !== undefined && !isCaseId(entry.caseId)) ||
    !journalPhases.includes(entry.phase as JournalPhase) ||
    (entry.status !== undefined && !isRegistrationStatus(entry.status)) ||
    (entry.actionId !== undefined &&
      (typeof entry.actionId !== "string" ||
        !ACTION_ID.test(entry.actionId))) ||
    (entry.proposalId !== undefined &&
      (typeof entry.proposalId !== "string" ||
        !ACTION_ID.test(entry.proposalId))) ||
    (entry.offerId !== undefined &&
      (typeof entry.offerId !== "string" || !OFFER_ID.test(entry.offerId))) ||
    (entry.quoteHash !== undefined && !isRequestHash(entry.quoteHash)) ||
    (entry.freshHash !== undefined && !isRequestHash(entry.freshHash)) ||
    (entry.recordId !== undefined && !isRecordId(entry.recordId)) ||
    (entry.requestHash !== undefined && !isRequestHash(entry.requestHash)) ||
    !timestamp(entry.createdAt) ||
    !timestamp(entry.updatedAt) ||
    (entry.issuedAt !== undefined && !timestamp(entry.issuedAt))
  ) {
    return undefined;
  }
  if (
    (entry.kind === "registration" || entry.kind === "runtime") &&
    !isRuntimeOperation(entry.operation)
  ) {
    return undefined;
  }
  if (
    entry.kind === "transfer" &&
    (!TRANSFER_OPERATIONS.includes(entry.operation) ||
      !entry.offerId ||
      !entry.proposalId)
  ) {
    return undefined;
  }
  return {
    operationId: entry.operationId,
    kind: entry.kind as JournalKind,
    operation: entry.operation,
    slug: entry.slug,
    programmeId: entry.programmeId,
    objectId: entry.objectId,
    ...(entry.caseId ? { caseId: entry.caseId as string } : {}),
    phase: entry.phase as JournalPhase,
    ...(entry.status ? { status: entry.status as RegistrationStatus } : {}),
    ...(entry.actionId ? { actionId: entry.actionId as string } : {}),
    ...(entry.proposalId ? { proposalId: entry.proposalId as string } : {}),
    ...(entry.offerId ? { offerId: entry.offerId as string } : {}),
    ...(entry.quoteHash ? { quoteHash: entry.quoteHash as string } : {}),
    ...(entry.freshHash ? { freshHash: entry.freshHash as string } : {}),
    ...(entry.recordId ? { recordId: entry.recordId as string } : {}),
    ...(entry.requestHash ? { requestHash: entry.requestHash as string } : {}),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    ...(entry.issuedAt ? { issuedAt: entry.issuedAt as number } : {}),
  };
}

const terminal = (phase: JournalPhase) =>
  phase === "cancelled" || phase === "settled";

/** Issued or submitted: authority left the wallet, so the entry is retained. */
export const authorityLeft = (phase: JournalPhase) =>
  phase === "assertion_issued" ||
  phase === "submitted" ||
  phase === "settled" ||
  phase === "observed";

export function pruneJournal(entries: FaceJournalEntry[], now: number) {
  return entries.filter((entry) =>
    terminal(entry.phase)
      ? now - entry.updatedAt < DAY_MS
      : now - entry.updatedAt < 7 * DAY_MS,
  );
}

export type JournalTransition =
  | {
      kind: "begin";
      entry: Omit<
        FaceJournalEntry,
        "phase" | "createdAt" | "updatedAt" | "status" | "actionId" | "issuedAt"
      >;
    }
  | { kind: "confirm"; operationId: string; objectId: string }
  | { kind: "cancel"; operationId: string }
  | { kind: "issue"; operationId: string; objectId: string; caseId?: string }
  | { kind: "submit"; operationId: string; objectId: string }
  | { kind: "record_action"; operationId: string; actionId: string }
  | {
      kind: "observe";
      operationId: string;
      objectId: string;
      slug: string;
      programmeId: string;
    }
  | { kind: "settle"; operationId: string; status: RegistrationStatus };

export type JournalTransitionError =
  | "operation_already_submitted"
  | "operation_conflict"
  | "unknown_operation"
  | "journal_full";

export type JournalTransitionResult =
  | { ok: true; entries: FaceJournalEntry[]; entry: FaceJournalEntry }
  | { ok: false; error: JournalTransitionError };

/**
 * Pure state machine. A phase only moves forward; once authority has left
 * the wallet (assertion issued or action submitted) the entry can be settled
 * by read-only reconciliation but never cancelled, reconfirmed or reissued.
 */
export function applyJournalTransition(
  entries: FaceJournalEntry[],
  transition: JournalTransition,
  now: number,
): JournalTransitionResult {
  const operationId =
    transition.kind === "begin"
      ? transition.entry.operationId
      : transition.operationId;
  const index = entries.findIndex((entry) => entry.operationId === operationId);
  const existing = index >= 0 ? entries[index] : undefined;
  const replace = (entry: FaceJournalEntry): JournalTransitionResult => {
    const next = [...entries];
    if (index >= 0) next[index] = entry;
    else next.push(entry);
    return { ok: true, entries: next, entry };
  };

  if (transition.kind === "begin") {
    if (existing) {
      if (authorityLeft(existing.phase)) {
        return { ok: false, error: "operation_already_submitted" };
      }
      if (
        existing.kind !== transition.entry.kind ||
        existing.objectId !== transition.entry.objectId ||
        existing.operation !== transition.entry.operation ||
        existing.phase !== "confirming"
      ) {
        return { ok: false, error: "operation_conflict" };
      }
      return { ok: true, entries, entry: existing };
    }
    let room = entries;
    if (room.length >= JOURNAL_MAX_ENTRIES) {
      // A finished (cancelled or settled) entry makes room; anything whose
      // authority may still be outstanding is kept.
      const finished = room
        .filter((entry) => terminal(entry.phase))
        .sort((left, right) => left.updatedAt - right.updatedAt)[0];
      if (!finished) return { ok: false, error: "journal_full" };
      room = room.filter((entry) => entry !== finished);
    }
    const entry: FaceJournalEntry = {
      ...transition.entry,
      phase: "confirming",
      createdAt: now,
      updatedAt: now,
    };
    return { ok: true, entries: [...room, entry], entry };
  }

  if (transition.kind === "observe") {
    if (existing) {
      return existing.objectId === transition.objectId
        ? { ok: true, entries, entry: existing }
        : { ok: false, error: "operation_conflict" };
    }
    const finished = entries
      .filter((entry) => terminal(entry.phase))
      .sort((left, right) => left.updatedAt - right.updatedAt)[0];
    const room =
      entries.length < JOURNAL_MAX_ENTRIES
        ? entries
        : finished
          ? entries.filter((entry) => entry !== finished)
          : undefined;
    // Observing is optional: without room the status is simply not known here.
    if (!room) return { ok: false, error: "journal_full" };
    const entry: FaceJournalEntry = {
      operationId: transition.operationId,
      kind: "registration",
      operation: "registration.submit",
      slug: transition.slug,
      programmeId: transition.programmeId,
      objectId: transition.objectId,
      phase: "observed",
      createdAt: now,
      updatedAt: now,
    };
    return { ok: true, entries: [...room, entry], entry };
  }

  if (!existing) return { ok: false, error: "unknown_operation" };

  switch (transition.kind) {
    case "confirm":
      if (authorityLeft(existing.phase)) {
        return { ok: false, error: "operation_already_submitted" };
      }
      if (
        existing.phase !== "confirming" ||
        existing.objectId !== transition.objectId
      ) {
        return { ok: false, error: "operation_conflict" };
      }
      return replace({ ...existing, phase: "confirmed", updatedAt: now });
    case "cancel":
      if (authorityLeft(existing.phase)) {
        return { ok: false, error: "operation_already_submitted" };
      }
      return replace({
        ...existing,
        phase: "cancelled",
        status: "not_submitted",
        updatedAt: now,
      });
    case "issue":
      if (authorityLeft(existing.phase)) {
        return { ok: false, error: "operation_already_submitted" };
      }
      if (
        existing.kind === "settle" ||
        existing.kind === "transfer" ||
        existing.phase !== "confirmed" ||
        existing.objectId !== transition.objectId ||
        (existing.caseId ?? undefined) !== transition.caseId
      ) {
        return { ok: false, error: "operation_conflict" };
      }
      return replace({
        ...existing,
        phase: "assertion_issued",
        issuedAt: now,
        updatedAt: now,
      });
    case "submit":
      if (authorityLeft(existing.phase)) {
        return { ok: false, error: "operation_already_submitted" };
      }
      if (
        (existing.kind !== "settle" && existing.kind !== "transfer") ||
        existing.phase !== "confirmed" ||
        existing.objectId !== transition.objectId
      ) {
        return { ok: false, error: "operation_conflict" };
      }
      return replace({
        ...existing,
        phase: "submitted",
        issuedAt: now,
        updatedAt: now,
      });
    case "record_action":
      if (
        (existing.kind !== "settle" && existing.kind !== "transfer") ||
        existing.phase !== "submitted" ||
        (existing.actionId && existing.actionId !== transition.actionId)
      ) {
        return { ok: false, error: "operation_conflict" };
      }
      return replace({
        ...existing,
        actionId: transition.actionId,
        updatedAt: now,
      });
    case "settle":
      if (!authorityLeft(existing.phase)) {
        return { ok: false, error: "operation_conflict" };
      }
      return replace({
        ...existing,
        phase: "settled",
        status: transition.status,
        updatedAt: now,
      });
  }
}

/**
 * Read-only status for a journalled operation from the wallet's canonical
 * readback. `outcome_unknown` never becomes `registered` without readback.
 */
export function journalOperationStatus(
  entry: FaceJournalEntry,
  evaluation:
    | "registered"
    | "ownership_moved_state_pending"
    | "recovery_required"
    | "review_required"
    | "not_owned"
    | undefined,
): RegistrationStatus {
  if (!authorityLeft(entry.phase)) return "not_submitted";
  if (entry.kind === "runtime") return "authorized";
  // G8: a transfer step is known only from the runtime's own verify/status.
  if (entry.kind === "transfer") {
    return entry.phase === "settled" ? "registered" : "outcome_unknown";
  }
  if (evaluation === undefined) return "outcome_unknown";
  if (entry.kind === "settle") {
    if (evaluation === "not_owned") return "recovery_required";
    if (evaluation === "ownership_moved_state_pending" && !entry.actionId) {
      return "outcome_unknown";
    }
    return evaluation;
  }
  return evaluation === "not_owned" ? "outcome_unknown" : evaluation;
}
