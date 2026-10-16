import "server-only";

import type { NextRequest } from "next/server";
import { walletIssuerOrigin } from "@/api/face-assertion";
import type { FaceJournal } from "@/api/face-journal";
import {
  acknowledgeRecovery,
  hostRuntimeCall,
  readRecoveryList,
  readRegistrationStatus,
  readWriteStatus,
  recoveryAckRequest,
  recoveryListRequest,
  registrationStatusRequestHash,
  runtimeRequestHash,
  verifiedOutcomeProof,
  writeStatusRequest,
  type RecoveryItem,
  type RuntimeEcho,
} from "@/api/face-runtime";
import {
  fail,
  mint,
  type FaceOperationResult,
} from "@/api/product-face-operations";
import type { FaceRequestContext } from "@/api/product-face-server";
import { sealForPurpose, unsealForPurpose } from "@/api/server-session";
import { hostJourneyEnabled } from "@/api/wallet-host";
import {
  isCaseId,
  isObjectId,
  isOperationId,
  type RuntimeOperation,
} from "@/app/_domain/product-face";
import { journeyOfJournalEntry } from "@/app/_domain/wallet-host";

// PROPOSED contract r20 (docs/proposals/runtime-write-status-r20.md), not
// deployed by any runtime: the host's durable recovery of this wallet's own
// operations whose outcome it may not have seen, without a cookie and without
// a remembered unit. Every runtime that does not answer exactly as the
// contract says is unsupported or unavailable here; nothing is then
// acknowledged, and the cookie-based retained listing keeps working.

/** Pages followed per runtime scan; more is reported as an incomplete check. */
const MAX_PAGES = 20;
/**
 * Items resolved per listing. Completed items first, then unresolved, then
 * refused, each class from a start that rotates per listing, so a prefix of
 * held or unknown items never starves a later completion; the rest are
 * returned as not checked and counted. The bound never makes a complete scan
 * incomplete and never raises a journal or cookie limit.
 */
const MAX_RESOLVED = 25;
/** How long an acknowledgement ticket issued by a listing stays usable. */
const TICKET_TTL_MS = 60 * 60 * 1000;
const ACTION_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/** The contract's one outcome vocabulary, plus the host's own two states. */
export type RecoveredOutcome =
  | "registered"
  | "transfer_request_committed"
  | "transferred"
  | "write_applied"
  | "write_refused"
  | "outcome_unknown"
  | "not_checked";

export interface RecoveredItem {
  operationId: string;
  kind: RecoveryItem["kind"];
  operation: string;
  objectId: string;
  caseId: string | null;
  offerId: string | null;
  step: RecoveryItem["step"];
  outcome: RecoveredOutcome;
  /** Present only when the item may be acknowledged (contract §4). */
  ticket: string | null;
}

export interface RecoveryListing {
  /** False when no runtime of this face answers r20 at all. */
  supported: boolean;
  /** True only when every scoped runtime's scan was complete, validated and followed to its end. */
  complete: boolean;
  /** Items of a journey this host disables: neither resolved nor returned. */
  withheld: number;
  /** Items beyond this listing's resolution bound, returned as not checked. */
  unchecked: number;
  items: RecoveredItem[];
}

/** One runtime the host lists from, and how mint routes an assertion to it. */
interface ScopedRuntime {
  origin: string;
  applicationId: string;
  /** Set for the linked Warranty runtime: mint routes case operations there. */
  audienceOf?: RuntimeOperation;
}

function scopedRuntimes(context: FaceRequestContext): ScopedRuntime[] {
  const own: ScopedRuntime = {
    origin: context.binding.origin,
    applicationId: context.binding.applicationId,
  };
  const linked = context.binding.linkedRuntimes
    .filter((runtime) => runtime.purpose === "claims-warranty")
    .map((runtime): ScopedRuntime => ({
      origin: runtime.origin,
      applicationId: runtime.applicationId,
      audienceOf: "case.read",
    }));
  return [own, ...linked];
}

const hex = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const text = (value: unknown, max = 256): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

/**
 * The §0 echoed binding of one answer against the session, this host, the
 * runtime the request was routed to, the face binding and the request sent.
 * Nothing is taken from the endpoint having answered.
 */
function echoMatches(
  context: FaceRequestContext,
  request: NextRequest,
  runtime: ScopedRuntime,
  operationId: string,
  echo: RuntimeEcho,
) {
  return (
    echo.operationId === operationId &&
    echo.holder === context.holder &&
    echo.wallet === context.wallet.id &&
    echo.issuer === walletIssuerOrigin(request) &&
    echo.applicationId === runtime.applicationId &&
    echo.programme === context.binding.programmeId &&
    echo.assertingArtifact.version === context.binding.version &&
    echo.assertingArtifact.artifactHash === context.binding.artifactHash
  );
}

/**
 * The additive r20 fields of an existing resolver's committed answer
 * (contract §0): the echo and the business counters at zero. Without them
 * the answer is pre-r20 for that operation and proves nothing here.
 */
function committedAnswerEcho(body: Record<string, unknown>) {
  const artifact = body.asserting_artifact;
  const bookkeeping = body.bookkeeping;
  if (
    body.contract !== "r20" ||
    body.writesExecuted !== 0 ||
    body.dualWritesExecuted !== 0 ||
    body.providerWritesExecuted !== 0 ||
    body.unknownWriteOutcomes !== 0 ||
    body.secretReturned !== false ||
    !record(bookkeeping) ||
    bookkeeping.assertionsConsumed !== 1 ||
    bookkeeping.acknowledgementsRecorded !== 0 ||
    !isOperationId(body.operation_id) ||
    !text(body.holder) ||
    !text(body.wallet) ||
    !text(body.issuer) ||
    !text(body.application_id) ||
    !text(body.programme) ||
    !record(artifact) ||
    !text(artifact.version, 64) ||
    !text(artifact.artifactHash, 80)
  ) {
    return undefined;
  }
  const echo: RuntimeEcho = {
    operationId: body.operation_id,
    holder: body.holder,
    wallet: body.wallet,
    issuer: body.issuer,
    applicationId: body.application_id,
    programme: body.programme,
    assertingArtifact: {
      version: artifact.version,
      artifactHash: artifact.artifactHash,
    },
  };
  return echo;
}

type Scan =
  | { status: "unsupported" }
  | { status: "listed"; items: RecoveryItem[]; complete: boolean };

const incomplete = (items: RecoveryItem[]): Scan => ({
  status: "listed",
  items,
  complete: false,
});

/** Strict order of a scan: (recorded_at, operation_id) ascending. */
function follows(previous: RecoveryItem | undefined, item: RecoveryItem) {
  if (!previous) return true;
  const before = Date.parse(previous.recordedAt);
  const now = Date.parse(item.recordedAt);
  if (before < now) return true;
  return before === now && previous.operationId < item.operationId;
}

/**
 * One runtime's scan: the pages of one snapshot followed to the end, each
 * page's binding, snapshot and order validated (contract §2). The host's own
 * reads: their assertions never reach a face, so none is kept against the
 * launch's outstanding cap.
 */
async function scanRuntime(
  context: FaceRequestContext,
  request: NextRequest,
  journal: FaceJournal,
  runtime: ScopedRuntime,
): Promise<Scan> {
  const items: RecoveryItem[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let snapshot: { scanId: string; asOf: number } | undefined;
  let complete = true;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const read = recoveryListRequest(`recovery-${hex(10)}`, cursor);
    const minted = mint(context, request, journal, {
      operation: "recovery.list",
      operationId: read.operationId,
      target: {},
      requestHash: runtimeRequestHash(read),
      ...(runtime.audienceOf ? { audienceOf: runtime.audienceOf } : {}),
    });
    if (!minted.ok) return incomplete(items);
    const result = await readRecoveryList(runtime, read, minted.assertion);
    if (result.outcome === "unsupported") {
      // Only a first page says the runtime has no r20; later it is a failure.
      return page === 0 ? { status: "unsupported" } : incomplete(items);
    }
    if (result.outcome !== "listed") return incomplete(items);
    const { page: listed } = result;
    const asOf = Date.parse(listed.asOf);
    if (
      !echoMatches(context, request, runtime, read.operationId, listed) ||
      Number.isNaN(asOf) ||
      (snapshot !== undefined &&
        (listed.scanId !== snapshot.scanId || asOf !== snapshot.asOf)) ||
      (listed.next !== null && cursors.has(listed.next))
    ) {
      return incomplete(items);
    }
    snapshot ??= { scanId: listed.scanId, asOf };
    for (const item of listed.items) {
      const recordedAt = Date.parse(item.recordedAt);
      if (
        Number.isNaN(recordedAt) ||
        recordedAt > asOf ||
        !follows(items.at(-1), item)
      ) {
        return incomplete(items);
      }
      items.push(item);
    }
    complete = complete && listed.complete;
    if (listed.next === null) return { status: "listed", items, complete };
    cursors.add(listed.next);
    cursor = listed.next;
  }
  // The scan goes on beyond what the host follows: not a complete check.
  return incomplete(items);
}

interface Proof {
  hash: string;
  originalOperation: string;
  target: { object_id: string; case_id?: string };
}

type Resolution = { outcome: RecoveredOutcome; proof?: Proof };

const UNKNOWN: Resolution = { outcome: "outcome_unknown" };

/**
 * The proof's identities against the listed original (contract §0): the
 * unit, and per kind the offer and step, the proposal, and the action, which
 * must equal the listed one when the listing carried it and otherwise be a
 * well-formed action id (a reconcile may find the action only now).
 */
function proofNamesItem(proof: Record<string, unknown>, item: RecoveryItem) {
  const actionMatches =
    item.actionId !== null
      ? proof.action_id === item.actionId
      : typeof proof.action_id === "string" && ACTION_ID.test(proof.action_id);
  if (proof.object_id !== item.objectId) return false;
  if (item.kind === "registration") {
    // A registration's action id may be absent on both sides.
    return item.actionId === null
      ? proof.action_id === null || actionMatches
      : actionMatches;
  }
  if (item.kind === "settle") {
    return proof.proposal_id === item.proposalId && actionMatches;
  }
  return (
    proof.offer_id === item.offerId && proof.step === item.step && actionMatches
  );
}

/**
 * The outcome of one listed item through the existing resolver of its kind,
 * each proving it from the historical canonical record and returning the
 * contract's outcome_proof. Read-only: nothing is reserved, re-sent or
 * executed, and this launch's journal is never written for it.
 */
async function resolveItem(
  context: FaceRequestContext,
  request: NextRequest,
  journal: FaceJournal,
  runtime: ScopedRuntime,
  item: RecoveryItem,
): Promise<Resolution> {
  const target = {
    object_id: item.objectId,
    ...(item.caseId ? { case_id: item.caseId } : {}),
  };
  if (item.kind === "runtime") {
    const read = writeStatusRequest(item.operationId, target, item.operation);
    const minted = mint(context, request, journal, {
      operation: "write.status",
      operationId: item.operationId,
      target: read.target,
      requestHash: runtimeRequestHash(read),
      audienceOf: item.operation as RuntimeOperation,
    });
    if (!minted.ok) return UNKNOWN;
    const result = await readWriteStatus(runtime, read, minted.assertion);
    if (result.outcome === "held") return UNKNOWN;
    const { record: recorded } = result;
    // Applied or refused, the answer is this write's only with its binding.
    if (
      !echoMatches(context, request, runtime, item.operationId, recorded) ||
      recorded.operation !== item.operation ||
      recorded.objectId !== item.objectId ||
      recorded.caseId !== item.caseId
    ) {
      return UNKNOWN;
    }
    if (result.outcome === "refused") return { outcome: "write_refused" };
    // A server-only effect is proved only with its fresh Dual target
    // readback ("absent" is held, a decision for Root: contract §5); a
    // Dual-backed one only with its minimal bound proof (the client checks).
    if (
      recorded.dual.backed === false &&
      recorded.dual.targetReadback !== "verified"
    ) {
      return UNKNOWN;
    }
    return {
      outcome: "write_applied",
      proof: {
        hash: recorded.outcomeHash,
        originalOperation: item.operation,
        target,
      },
    };
  }
  const expected: RecoveredOutcome =
    item.kind === "transfer"
      ? item.step === "request"
        ? "transfer_request_committed"
        : "transferred"
      : "registered";
  let body: Record<string, unknown> | undefined;
  let requestOperationId: string;
  if (item.kind === "registration") {
    requestOperationId = item.operationId;
    const minted = mint(context, request, journal, {
      operation: "registration.status",
      operationId: item.operationId,
      target: { object_id: item.objectId },
      requestHash: registrationStatusRequestHash(item.operationId),
    });
    if (!minted.ok) return UNKNOWN;
    const status = await readRegistrationStatus(
      runtime,
      item.operationId,
      minted.assertion,
    );
    if (status.outcome !== "answered" || status.status !== expected) {
      return UNKNOWN;
    }
    body = status.body;
  } else {
    // A settle or transfer step: the runtime's own read-only reconcile
    // through the Dual action logs (transfer.status, never transfer.verify:
    // the host holds no action id of its own for a recovered step).
    const read =
      item.kind === "settle"
        ? {
            operation: "registration.settle.status" as const,
            operationId: `settle-status-${hex(10)}`,
            target: { object_id: item.objectId },
            input: {
              settle_operation_id: item.operationId,
              proposal_id: item.proposalId,
            },
          }
        : {
            operation: "transfer.status" as const,
            operationId: `status-${hex(10)}`,
            target: { object_id: item.objectId },
            input: {
              offer_id: item.offerId,
              step_operation_id: item.operationId,
            },
          };
    requestOperationId = read.operationId;
    const minted = mint(context, request, journal, {
      operation: read.operation,
      operationId: read.operationId,
      target: read.target,
      requestHash: runtimeRequestHash(read),
    });
    if (!minted.ok) return UNKNOWN;
    const result = await hostRuntimeCall(runtime, read, minted.assertion);
    if (!result.ok || result.status !== 200) return UNKNOWN;
    if (result.body.status !== expected) return UNKNOWN;
    body = result.body;
  }
  if (!body) return UNKNOWN;
  const echo = committedAnswerEcho(body);
  if (
    !echo ||
    !echoMatches(context, request, runtime, requestOperationId, echo)
  ) {
    return UNKNOWN;
  }
  const proof = verifiedOutcomeProof(body, {
    kind: item.kind,
    operationId: item.operationId,
    status: expected,
  });
  if (!proof || !proofNamesItem(proof.proof, item)) return UNKNOWN;
  return {
    outcome: expected,
    proof: {
      hash: proof.hash,
      originalOperation: item.operation,
      target: { object_id: item.objectId },
    },
  };
}

interface Ticket {
  v: 1;
  op: string;
  kind: RecoveryItem["kind"];
  original_operation: string;
  target: { object_id: string; case_id?: string };
  outcome_hash: string;
  /** The runtime the outcome was proved at: its application AND origin. */
  runtime: { application_id: string; origin: string };
  /** The face artifact the host served when it proved the outcome. */
  artifact: { version: string; artifact_hash: string };
  exp: number;
}

/** A ticket is this session's, this wallet's and this face launch's only. */
const ticketPurpose = (context: FaceRequestContext) =>
  [
    "dual-face-recovery-ack",
    context.owner.sidHash,
    context.wallet.id,
    context.binding.slug,
    context.binding.programmeId,
    context.scope.launchId,
  ].join(":");

const itemJourney = (item: Pick<RecoveryItem, "kind" | "operation">) =>
  journeyOfJournalEntry({ kind: item.kind, operation: item.operation });

/**
 * GET /api/faces/[slug]/recovery: this wallet's unresolved and unacknowledged
 * operations from the face's runtime and its linked runtime, each resolved
 * through its kind's resolver, with an acknowledgement ticket only for a
 * proved outcome of an enabled journey found by a complete check.
 */
export async function listRecovery(
  context: FaceRequestContext,
  request: NextRequest,
): Promise<RecoveryListing> {
  const journal = context.journal;
  const scans = await Promise.all(
    scopedRuntimes(context).map(async (runtime) => ({
      runtime,
      scan: await scanRuntime(context, request, journal, runtime),
    })),
  );
  const supported = scans.some(({ scan }) => scan.status !== "unsupported");
  if (!supported) {
    return {
      supported: false,
      complete: true,
      withheld: 0,
      unchecked: 0,
      items: [],
    };
  }
  // A runtime without r20 beside one with it: the check cannot be complete.
  const complete = scans.every(
    ({ scan }) => scan.status === "listed" && scan.complete,
  );
  const listed = scans.flatMap(({ runtime, scan }) =>
    scan.status === "listed"
      ? scan.items.map((item) => ({ runtime, item }))
      : [],
  );
  // An id listed by two runtimes (a scan itself never repeats one) is
  // conflicting: nothing is resolved or acknowledged for it.
  const seen = new Map<string, number>();
  for (const { item } of listed) {
    seen.set(item.operationId, (seen.get(item.operationId) ?? 0) + 1);
  }
  let withheld = 0;
  const eligible = listed.filter(({ item }) => {
    const journey = itemJourney(item);
    if (journey && hostJourneyEnabled(journey)) return true;
    withheld += 1;
    return false;
  });
  // Which items this listing resolves: completed first, then unresolved,
  // then refused, each class in listing order from a rotating start. The
  // same id from two runtimes is conflicting and resolved by neither.
  const classes = (["completed", "unresolved", "refused"] as const).map(
    (state) =>
      eligible.filter(
        ({ item }) =>
          item.state === state && (seen.get(item.operationId) ?? 0) === 1,
      ),
  );
  const chosen = new Set<string>();
  for (const members of classes) {
    if (members.length === 0 || chosen.size >= MAX_RESOLVED) continue;
    const start =
      crypto.getRandomValues(new Uint32Array(1))[0] % members.length;
    for (let offset = 0; offset < members.length; offset += 1) {
      if (chosen.size >= MAX_RESOLVED) break;
      chosen.add(members[(start + offset) % members.length].item.operationId);
    }
  }
  let unchecked = 0;
  const now = Date.now();
  const items: RecoveredItem[] = [];
  for (const { runtime, item } of eligible) {
    const base = {
      operationId: item.operationId,
      kind: item.kind,
      operation: item.operation,
      objectId: item.objectId,
      caseId: item.caseId,
      offerId: item.offerId,
      step: item.step,
    };
    if (!chosen.has(item.operationId)) {
      if ((seen.get(item.operationId) ?? 0) === 1) unchecked += 1;
      items.push({ ...base, outcome: "not_checked", ticket: null });
      continue;
    }
    const { outcome, proof } = await resolveItem(
      context,
      request,
      journal,
      runtime,
      item,
    );
    // A ticket only for a proved outcome, and only when every scoped scan
    // was complete: an incomplete check acknowledges nothing.
    const ticket: Ticket | undefined =
      proof && complete
        ? {
            v: 1,
            op: item.operationId,
            kind: item.kind,
            original_operation: proof.originalOperation,
            target: proof.target,
            outcome_hash: proof.hash,
            runtime: {
              application_id: runtime.applicationId,
              origin: runtime.origin,
            },
            artifact: {
              version: context.binding.version,
              artifact_hash: context.binding.artifactHash,
            },
            exp: now + TICKET_TTL_MS,
          }
        : undefined;
    items.push({
      ...base,
      outcome,
      ticket: ticket ? sealForPurpose(ticketPurpose(context), ticket) : null,
    });
  }
  return { supported: true, complete, withheld, unchecked, items };
}

function parseTicket(
  context: FaceRequestContext,
  value: unknown,
  operationId: string,
): Ticket | undefined {
  if (typeof value !== "string" || value.length > 4096) return undefined;
  const opened = unsealForPurpose(ticketPurpose(context), value);
  if (!record(opened)) return undefined;
  const ticket = opened as Partial<Ticket>;
  const runtime = ticket.runtime as Partial<Ticket["runtime"]> | undefined;
  const artifact = ticket.artifact as Partial<Ticket["artifact"]> | undefined;
  if (
    ticket.v !== 1 ||
    ticket.op !== operationId ||
    !isOperationId(ticket.op) ||
    typeof ticket.kind !== "string" ||
    typeof ticket.original_operation !== "string" ||
    !record(ticket.target) ||
    !isObjectId(ticket.target.object_id) ||
    (ticket.target.case_id !== undefined && !isCaseId(ticket.target.case_id)) ||
    typeof ticket.outcome_hash !== "string" ||
    !record(runtime) ||
    typeof runtime.application_id !== "string" ||
    typeof runtime.origin !== "string" ||
    !record(artifact) ||
    typeof artifact.version !== "string" ||
    typeof artifact.artifact_hash !== "string" ||
    typeof ticket.exp !== "number" ||
    ticket.exp <= Date.now()
  ) {
    return undefined;
  }
  return ticket as Ticket;
}

/**
 * POST /api/faces/[slug]/recovery/ack: records at the runtime, idempotently,
 * that this host delivered one proved outcome. The ticket a complete listing
 * issued in this same launch names the outcome's hash, the runtime it was
 * proved at and the face artifact served then; the journey, the runtime
 * binding and the artifact are checked again now. Nothing of the business
 * record is modified.
 */
export async function acknowledgeRecoveredOutcome(
  context: FaceRequestContext,
  request: NextRequest,
  body: Record<string, unknown>,
): Promise<FaceOperationResult<{ first: boolean }>> {
  if (
    Object.keys(body).sort().join(",") !== "operation_id,ticket" ||
    !isOperationId(body.operation_id)
  ) {
    return fail("invalid_request", 400);
  }
  const ticket = parseTicket(context, body.ticket, body.operation_id);
  if (!ticket) return fail("invalid_request", 400);
  const journey = itemJourney({
    kind: ticket.kind,
    operation: ticket.original_operation,
  });
  if (!journey || !hostJourneyEnabled(journey)) {
    return fail("capability_not_granted", 403);
  }
  // The same runtime (application and origin) must still be bound and the
  // same face artifact still served; otherwise the ticket is no longer valid.
  const runtime = scopedRuntimes(context).find(
    (candidate) =>
      candidate.applicationId === ticket.runtime.application_id &&
      candidate.origin === ticket.runtime.origin,
  );
  if (
    !runtime ||
    ticket.artifact.version !== context.binding.version ||
    ticket.artifact.artifact_hash !== context.binding.artifactHash
  ) {
    return fail("invalid_request", 400);
  }
  const ack = recoveryAckRequest(
    ticket.op,
    ticket.target,
    ticket.original_operation,
    ticket.outcome_hash,
  );
  const minted = mint(context, request, context.journal, {
    operation: "recovery.ack",
    operationId: ack.operationId,
    target: ack.target,
    requestHash: runtimeRequestHash(ack),
    ...(runtime.audienceOf ? { audienceOf: runtime.audienceOf } : {}),
  });
  if (!minted.ok) return minted;
  const result = await acknowledgeRecovery(runtime, ack, minted.assertion);
  if (
    result.outcome !== "acknowledged" ||
    !echoMatches(context, request, runtime, ticket.op, result.echo)
  ) {
    return fail("outcome_unknown", 409);
  }
  return { ok: true, first: result.first };
}
