import "server-only";

import { touchesObject } from "@/app/_adapters/product-face";
import type { ProductHistoryEntry } from "@/app/_domain/product-face";
import { getEbusApi, getObjectsApi } from "@/api/web-sdk-client";
import type { ActionLog } from "@/api/web-sdk/models/ActionLog";
import type { StateChange } from "@/api/web-sdk/models/StateChange";
import { ResponseError } from "@/api/web-sdk/runtime";

/** A product's history: at most this many actions, from at most this many pages of changes. */
export const PRODUCT_HISTORY_ENTRIES = 25;
const CHANGE_PAGES = 4;
/** Status reads by action id run this many at a time. */
const STATUS_READS_AT_ONCE = 4;

/** The object's public history could not be read exactly; nothing is shown. */
export class ProductHistoryUnavailable extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ProductHistoryUnavailable";
  }
}

const STATUSES = new Set<ProductHistoryEntry["status"]>([
  "pending",
  "completed",
  "failed",
]);

function isStatus(error: unknown, status: number) {
  return error instanceof ResponseError && error.response.status === status;
}

/**
 * One object's own public lifecycle across every owner, newest first.
 *
 * The signed-in action-log list answers only for the caller's organisation,
 * so a later owner never sees the mint, the first registration or the
 * earlier owner's transfer there. The object's public state changes are its
 * whole history whoever acted, so they decide which actions belong: each
 * change must name this object, and consecutive changes must join nonce to
 * nonce (a gap is never shown as history). Read to the end, the oldest change
 * must be the object's creation. Each action keeps its own id; its status is
 * the public action log's own answer for that exact action and object, and
 * "unknown" when that could not be read (never promoted to completed). Only
 * the action, its status and when are returned: no attribute changes, owners
 * or parameters.
 *
 * Undefined when the object does not exist; ProductHistoryUnavailable when
 * its history cannot be read exactly.
 */
export async function readPublicProductHistory(
  objectId: string,
): Promise<ProductHistoryEntry[] | undefined> {
  const changes = new Map<string, StateChange>();
  let ended = false;
  let next: string | undefined;
  for (let page = 0; page < CHANGE_PAGES; page += 1) {
    let result;
    try {
      result = await getObjectsApi().listStateChangesPublic(
        { objectId, limit: 25, next },
        { cache: "no-store" },
      );
    } catch (error) {
      if (page === 0 && isStatus(error, 404)) return undefined;
      throw error;
    }
    for (const change of result.stateChanges) {
      if (change.objectId !== objectId) {
        throw new ProductHistoryUnavailable("change_for_another_object");
      }
      changes.set(change.id, change);
    }
    next = result.next || undefined;
    if (!next) {
      ended = true;
      break;
    }
    if (
      distinctActions([...changes.values()]).length > PRODUCT_HISTORY_ENTRIES
    ) {
      break;
    }
  }

  const ordered = [...changes.values()].sort(
    (a, b) => b.nextNonce - a.nextNonce,
  );
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1].prevNonce !== ordered[index].nextNonce) {
      throw new ProductHistoryUnavailable("history_not_continuous");
    }
  }
  // Every object that exists has its creation: an ended list without it is not its history.
  if (ended && ordered.at(-1)?.changeType !== "create") {
    throw new ProductHistoryUnavailable("creation_missing");
  }

  const actions = distinctActions(ordered).slice(0, PRODUCT_HISTORY_ENTRIES);
  const logs = await readActionLogs(
    objectId,
    actions.map((change) => change.actionId),
  );
  return actions.map((change) => {
    const log = logs.get(change.actionId);
    return {
      actionId: change.actionId,
      action: log ? log.alias || log.name : change.actionName,
      status: log && STATUSES.has(log.status) ? log.status : "unknown",
      when: log ? log.whenCreated : change.whenCreated,
    };
  });
}

function distinctActions(changes: StateChange[]) {
  const seen = new Set<string>();
  return changes.filter((change) => {
    if (seen.has(change.actionId)) return false;
    seen.add(change.actionId);
    return true;
  });
}

/**
 * The public action-log entries for exactly these actions on this object:
 * first the object's own filtered list, then each still-missing action by
 * its id. An entry counts only when its id is the action's and its affected
 * objects name this object; a read that fails leaves that action unknown.
 */
async function readActionLogs(objectId: string, actionIds: string[]) {
  const wanted = new Set(actionIds);
  const logs = new Map<string, ActionLog>();
  const keep = (log: ActionLog) => {
    if (wanted.has(log.id) && touchesObject(log, objectId))
      logs.set(log.id, log);
  };
  try {
    const result = await getEbusApi().listActionLogsPublic(
      { objectId, limit: 25, order: "desc", sortBy: "when_created" },
      { cache: "no-store" },
    );
    result.actionLogs.forEach(keep);
  } catch {
    // Each action is read by its id below.
  }
  const missing = actionIds.filter((id) => !logs.has(id));
  for (let start = 0; start < missing.length; start += STATUS_READS_AT_ONCE) {
    await Promise.all(
      missing.slice(start, start + STATUS_READS_AT_ONCE).map(async (id) => {
        try {
          const result = await getEbusApi().listActionLogsPublic(
            { id, limit: 1 },
            { cache: "no-store" },
          );
          result.actionLogs.forEach(keep);
        } catch {
          // Its status stays unknown.
        }
      }),
    );
  }
  return logs;
}
