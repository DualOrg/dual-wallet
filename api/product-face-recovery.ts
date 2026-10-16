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
  isObjectId,
  isOperationId,
  isCaseId,
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
/** Items resolved per request; more is reported as an incomplete check. */
const MAX_RESOLVED = 25;
/** How long an acknowledgement ticket issued by a listing stays usable. */
const TICKET_TTL_MS = 60 * 60 * 1000;

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
  /** Present only when the item may be acknowledged (§4 of the contract). */
  ticket: string | null;
}

export interface RecoveryListing {
  /** False when no runtime of this face answers r20 at all. */
  supported: boolean;
  /** True only when every scoped runtime's scan was complete and followed to its end. */
  complete: boolean;
  /** Items of a journey this host disables: neither resolved nor returned. */
  withheld: number;
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

type Scan =
  | { status: "unsupported" }
  | { status: "listed"; items: RecoveryItem[]; complete: boolean };

/**
 * One runtime's scan: pages of one snapshot followed to the end, each page's
 * binding validated. The host's own reads: their assertions never reach a
 * face, so none is kept against the launch's outstanding cap.
 */
async function scanRuntime(
  context: FaceRequestContext,
  request: NextRequest,
  journal: FaceJournal,
  runtime: ScopedRuntime,
): Promise<Scan> {
  const items: RecoveryItem[] = [];
  let cursor: string | undefined;
  let scanId: string | undefined;
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
    if (!minted.ok) return { status: "listed", items, complete: false };
    const result = await readRecoveryList(runtime, read, minted.assertion);
    if (result.outcome === "unsupported") {
      // Only a first page says the runtime has no r20; later it is a failure.
      return page === 0
        ? { status: "unsupported" }
        : { status: "listed", items, complete: false };
    }
    if (result.outcome !== "listed") {
      return { status: "listed", items, complete: false };
    }
    const { page: listed } = result;
    if (
      !echoMatches(context, request, runtime, read.operationId, listed) ||
      (scanId !== undefined && listed.scanId !== scanId)
    ) {
      return { status: "listed", items, complete: false };
    }
    scanId = listed.scanId;
    items.push(...listed.items);
    complete = complete && listed.complete;
    if (listed.next === null) return { status: "listed", items, complete };
    cursor = listed.next;
  }
  // The scan goes on beyond what the host follows: not a complete check.
  return { status: "listed", items, complete: false };
}

interface Proof {
  hash: string;
  originalOperation: string;
  target: { object_id: string; case_id?: string };
}

type Resolution = { outcome: RecoveredOutcome; proof?: Proof };

const UNKNOWN: Resolution = { outcome: "outcome_unknown" };

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
    if (result.outcome === "refused") return { outcome: "write_refused" };
    if (result.outcome !== "applied") return UNKNOWN;
    const { record } = result;
    if (
      !echoMatches(context, request, runtime, item.operationId, record) ||
      record.operation !== item.operation ||
      record.objectId !== item.objectId ||
      record.caseId !== item.caseId ||
      // A server-only effect is proved only with its fresh Dual target
      // readback; "absent" is held (a decision for Root, contract §5).
      record.dual.targetReadback !== "verified"
    ) {
      return UNKNOWN;
    }
    return {
      outcome: "write_applied",
      proof: {
        hash: record.outcomeHash,
        originalOperation: item.operation,
        target,
      },
    };
  }
  if (item.kind === "registration") {
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
    if (
      status.outcome !== "answered" ||
      status.status !== "registered" ||
      !status.body
    ) {
      return UNKNOWN;
    }
    const proof = verifiedOutcomeProof(status.body, {
      kind: "registration",
      operationId: item.operationId,
      status: "registered",
    });
    return proof
      ? {
          outcome: "registered",
          proof: {
            hash: proof.hash,
            originalOperation: "registration.submit",
            target: { object_id: item.objectId },
          },
        }
      : UNKNOWN;
  }
  // A settle or transfer step: the runtime's own read-only reconcile through
  // the Dual action logs, never an execution.
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
      : item.actionId
        ? {
            operation: "transfer.verify" as const,
            operationId: `verify-${hex(10)}`,
            target: { object_id: item.objectId },
            input: {
              offer_id: item.offerId,
              action_id: item.actionId,
              step_operation_id: item.operationId,
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
  const minted = mint(context, request, journal, {
    operation: read.operation,
    operationId: read.operationId,
    target: read.target,
    requestHash: runtimeRequestHash(read),
  });
  if (!minted.ok) return UNKNOWN;
  const result = await hostRuntimeCall(runtime, read, minted.assertion);
  if (!result.ok || result.status !== 200) return UNKNOWN;
  const expected: RecoveredOutcome =
    item.kind === "settle"
      ? "registered"
      : item.step === "request"
        ? "transfer_request_committed"
        : "transferred";
  if (result.body.status !== expected) return UNKNOWN;
  const proof = verifiedOutcomeProof(result.body, {
    kind: item.kind,
    operationId: item.operationId,
    status: expected,
  });
  return proof
    ? {
        outcome: expected,
        proof: {
          hash: proof.hash,
          originalOperation: item.operation,
          target: { object_id: item.objectId },
        },
      }
    : UNKNOWN;
}

interface Ticket {
  v: 1;
  op: string;
  kind: RecoveryItem["kind"];
  original_operation: string;
  target: { object_id: string; case_id?: string };
  outcome_hash: string;
  runtime: string;
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
    return { supported: false, complete: true, withheld: 0, items: [] };
  }
  // A runtime without r20 beside one with it: the check cannot be complete.
  let complete = scans.every(
    ({ scan }) => scan.status === "listed" && scan.complete,
  );
  const listed = scans.flatMap(({ runtime, scan }) =>
    scan.status === "listed"
      ? scan.items.map((item) => ({ runtime, item }))
      : [],
  );
  // An id listed twice, within a scan or by two runtimes, is conflicting:
  // nothing is resolved or acknowledged for it.
  const seen = new Map<string, number>();
  for (const { item } of listed) {
    seen.set(item.operationId, (seen.get(item.operationId) ?? 0) + 1);
  }
  let withheld = 0;
  let resolved = 0;
  const items: RecoveredItem[] = [];
  for (const { runtime, item } of listed) {
    const journey = itemJourney(item);
    if (!journey || !hostJourneyEnabled(journey)) {
      withheld += 1;
      continue;
    }
    const base = {
      operationId: item.operationId,
      kind: item.kind,
      operation: item.operation,
      objectId: item.objectId,
      caseId: item.caseId,
      offerId: item.offerId,
      step: item.step,
    };
    if ((seen.get(item.operationId) ?? 0) > 1 || resolved >= MAX_RESOLVED) {
      if (resolved >= MAX_RESOLVED) complete = false;
      items.push({ ...base, outcome: "not_checked", ticket: null });
      continue;
    }
    resolved += 1;
    const resolution = await resolveItem(
      context,
      request,
      journal,
      runtime,
      item,
    );
    items.push({ ...base, outcome: resolution.outcome, ticket: null });
    if (resolution.proof) {
      // Filled in below once the whole check is known to be complete.
      items[items.length - 1].ticket = JSON.stringify({
        proof: resolution.proof,
        runtime: runtime.applicationId,
      });
    }
  }
  const now = Date.now();
  for (const item of items) {
    if (!item.ticket) continue;
    if (!complete) {
      // An incomplete check acknowledges nothing, however well proved.
      item.ticket = null;
      continue;
    }
    const { proof, runtime } = JSON.parse(item.ticket) as {
      proof: Proof;
      runtime: string;
    };
    const ticket: Ticket = {
      v: 1,
      op: item.operationId,
      kind: item.kind,
      original_operation: proof.originalOperation,
      target: proof.target,
      outcome_hash: proof.hash,
      runtime,
      exp: now + TICKET_TTL_MS,
    };
    item.ticket = sealForPurpose(ticketPurpose(context), ticket);
  }
  return { supported: true, complete, withheld, items };
}

function parseTicket(
  context: FaceRequestContext,
  value: unknown,
  operationId: string,
): Ticket | undefined {
  if (typeof value !== "string" || value.length > 4096) return undefined;
  const opened = unsealForPurpose(ticketPurpose(context), value);
  if (!opened || typeof opened !== "object") return undefined;
  const ticket = opened as Partial<Ticket>;
  if (
    ticket.v !== 1 ||
    ticket.op !== operationId ||
    !isOperationId(ticket.op) ||
    typeof ticket.kind !== "string" ||
    typeof ticket.original_operation !== "string" ||
    !ticket.target ||
    !isObjectId(ticket.target.object_id) ||
    (ticket.target.case_id !== undefined && !isCaseId(ticket.target.case_id)) ||
    typeof ticket.outcome_hash !== "string" ||
    typeof ticket.runtime !== "string" ||
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
 * issued in this same launch names the outcome's hash; the journey is checked
 * again now. Nothing of the business record is modified.
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
  const runtime = scopedRuntimes(context).find(
    (candidate) => candidate.applicationId === ticket.runtime,
  );
  if (!runtime) return fail("invalid_request", 400);
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
