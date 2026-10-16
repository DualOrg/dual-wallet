"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  productTaskHref,
  ProductFaceError,
  taskPathFromPathname,
  type ProductFaceApplication,
  type ProductFaceConfirmation,
  type SessionEndReason,
} from "@/app/_domain/product-face";
import { queryKeys } from "@/app/_hooks/query-keys";
import {
  startProductFaceBridge,
  type ProductFaceBridgeHost,
  type ProductFaceHandlers,
} from "@/app/_lib/external-face-bridge";
import type { ProductFaceHostNotice } from "@/app/_lib/external-face-bridge/core/product-session";
import {
  executeAs,
  executorIdentityOf,
  faceExecutionOf,
  type ExecutorIdentity,
} from "@/app/_lib/external-face-bridge/core/executor-identity";
import { useSession } from "@/app/_providers/session-provider";
import {
  acknowledgeFaceRecovery,
  executeSettleAction,
  executeTransferAction,
  listFaceOperations,
  listFaceRecovery,
  type FaceRecovery,
  listRetainedTransferSteps,
  listProgrammeProducts,
  mintFaceAssertion,
  readFaceOperationStatus,
  readProgrammeProduct,
  readProgrammeProductActions,
  readProgrammeProductAttributes,
  readProgrammeProductHistory,
  readProgrammeUnit,
  readSettleProposal,
  readTransferProgress,
  readTransferProposal,
  readAcceptOffer,
  selectProgrammeProduct,
  sha256Hash,
  takeFaceHandoverTicket,
  writeFaceJournal,
  type FaceRecoveryOutcome,
} from "@/app/_services/product-face.client";

/** Pages of one launch's recovery listing followed per collection (r20). */
const MAX_RECOVERY_PAGES = 8;

/**
 * What one collection of recovery pages established. Scan completeness (the
 * runtimes' own full scans, and every page read) is kept apart from
 * resolution progress (a continuation remaining): only the former decides
 * whether anything may be acknowledged; the latter is continued on request.
 */
interface RecoveryCollection {
  supported: boolean;
  /** Every page's runtime scans were complete. */
  scanComplete: boolean;
  /** A page could not be read: the check's state is unknown until re-read. */
  readFailed: boolean;
  /** The sealed key to continue from, when items remain beyond the pages. */
  continuation: string | null;
  withheld: number;
  items: FaceRecovery["items"];
}

/**
 * Follows a bounded number of pages of the BFF's recovery listing, from the
 * start or from a continuation, deterministically: the BFF resolves a page of
 * items in the contract's stable order and returns a sealed continuation
 * while items remain. Later pages replace earlier pages' unchecked entries.
 * Reaching the page bound with a continuation left is progress to continue,
 * never an incomplete scan.
 */
async function collectRecovery(
  face: Parameters<typeof listFaceRecovery>[0],
  live: () => boolean,
  from: string | null = null,
): Promise<RecoveryCollection> {
  const merged = new Map<string, FaceRecovery["items"][number]>();
  let scanComplete = true;
  let readFailed = false;
  let withheld = 0;
  let continuation = from;
  let pages = 0;
  do {
    if (!live()) {
      return {
        supported: true,
        scanComplete,
        readFailed: true,
        continuation,
        withheld,
        items: [...merged.values()],
      };
    }
    let page: FaceRecovery;
    try {
      page =
        continuation === null
          ? await listFaceRecovery(face)
          : await listFaceRecovery(face, continuation);
    } catch (error) {
      // The first page failing is the listing failing; a later one is kept
      // as a continuation to re-read.
      if (pages === 0 && from === null) throw error;
      readFailed = true;
      break;
    }
    if (!page.supported) {
      return {
        supported: false,
        scanComplete: true,
        readFailed: false,
        continuation: null,
        withheld: 0,
        items: [],
      };
    }
    pages += 1;
    if (pages === 1) withheld = page.withheld;
    for (const item of page.items) merged.set(item.operation_id, item);
    scanComplete = scanComplete && page.complete;
    continuation =
      typeof page.continuation === "string" ? page.continuation : null;
  } while (continuation !== null && pages < MAX_RECOVERY_PAGES);
  return {
    supported: true,
    scanComplete,
    readFailed,
    continuation,
    withheld,
    items: [...merged.values()],
  };
}

export type ProductFaceHostState =
  | { status: "loading" }
  | { status: "live" }
  | { status: "ended"; reason: SessionEndReason };

type ConfirmationState =
  | { status: "idle" }
  | { status: "open"; id: number; request: ProductFaceConfirmation };

type ConfirmationAction =
  | { type: "open"; id: number; request: ProductFaceConfirmation }
  | { type: "close"; id: number };

function confirmationReducer(
  state: ConfirmationState,
  action: ConfirmationAction,
): ConfirmationState {
  if (action.type === "open") {
    return { status: "open", id: action.id, request: action.request };
  }
  return state.status === "open" && state.id === action.id
    ? { status: "idle" }
    : state;
}

type HostAction =
  { type: "live" } | { type: "ended"; reason: SessionEndReason };

// Proposed contract r20: the committed outcomes a host may acknowledge once
// seen. Everything else is held, unknown, refused or unchecked.
const provedRecoveryOutcomes: ReadonlySet<FaceRecoveryOutcome> = new Set([
  "registered",
  "transfer_request_committed",
  "transferred",
  "write_applied",
]);

function hostReducer(
  state: ProductFaceHostState,
  action: HostAction,
): ProductFaceHostState {
  if (state.status === "ended") return state;
  return action.type === "live"
    ? { status: "live" }
    : { status: "ended", reason: action.reason };
}

/**
 * Owns one product-face channel: its wallet-side handlers, the native
 * confirmation queue (one at a time), task-path mirroring and teardown when
 * the wallet session ends.
 */
export function useProductFaceHost({
  slug,
  launchId,
  application,
  frameUrl,
  onEnded,
}: {
  slug: string;
  /** This frame's launch id: its own journal and selection on the server. */
  launchId: string;
  application: ProductFaceApplication;
  frameUrl: string;
  onEnded: (reason: SessionEndReason) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const session = useSession();
  const [state, dispatch] = useReducer(hostReducer, { status: "loading" });
  const [confirmation, dispatchConfirmation] = useReducer(confirmationReducer, {
    status: "idle",
  });
  const [notice, setNotice] = useState<ProductFaceHostNotice | null>(null);
  const host = useRef<ProductFaceBridgeHost | undefined>(undefined);
  const pendingConfirmation = useRef<
    { id: number; resolve: (confirmed: boolean) => void } | undefined
  >(undefined);
  const confirmationId = useRef(0);
  // Proposed contract r20 (not deployed): the acknowledgement tickets of the
  // recovery items this launch's live host listed, by operation id. Taken
  // once when the person dismisses the notice; never rendered, never kept
  // past the host that listed them.
  /**
   * This launch's recovery so far (proposed r20): the merged items, the
   * tickets of the items that may be acknowledged, the scan completeness and
   * the continuation to check further from. Cleared with the launch.
   */
  const recoveryState = useRef<
    | {
        face: { slug: string; launchId: string };
        items: Map<string, FaceRecovery["items"][number]>;
        scanComplete: boolean;
        readFailed: boolean;
        continuation: string | null;
      }
    | undefined
  >(undefined);
  const lastTask = useRef<string | undefined>(undefined);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const task = taskPathFromPathname(pathname, slug) ?? "/";

  const answerConfirmation = useCallback((confirmed: boolean) => {
    const pending = pendingConfirmation.current;
    if (!pending) return;
    pendingConfirmation.current = undefined;
    dispatchConfirmation({ type: "close", id: pending.id });
    pending.resolve(confirmed);
  }, []);

  const end = useCallback(
    (reason: SessionEndReason) => {
      host.current?.end(reason);
      host.current = undefined;
      recoveryState.current = undefined;
      answerConfirmation(false);
      dispatch({ type: "ended", reason });
      onEnded(reason);
      queryClient.removeQueries({ queryKey: queryKeys.productFaces.all });
    },
    [answerConfirmation, onEnded, queryClient],
  );

  // Logout, expiry and account change close the channel — session.ended
  // first — and remove the frame.
  useEffect(() => session.onSessionEnd(end), [end, session]);

  useEffect(
    () => () => {
      host.current?.close();
      host.current = undefined;
      recoveryState.current = undefined;
      const pending = pendingConfirmation.current;
      pendingConfirmation.current = undefined;
      pending?.resolve(false);
    },
    [],
  );

  // Back/Forward and links move the wallet URL; the face hears the task.
  useEffect(() => {
    if (lastTask.current === undefined) {
      lastTask.current = task;
      return;
    }
    if (lastTask.current === task) return;
    lastTask.current = task;
    host.current?.restoreTask(task);
  }, [task]);

  /** The recovery notice from this launch's merged state. */
  const showRecovery = useCallback(() => {
    const current = recoveryState.current;
    if (!current) return;
    const complete = current.scanComplete && !current.readFailed;
    const moreToCheck = current.continuation !== null;
    if (current.items.size === 0 && complete && !moreToCheck) return;
    setNotice({
      kind: "recovery",
      complete,
      moreToCheck,
      items: [...current.items.values()].map((item) => ({
        operationId: item.operation_id,
        kind: item.kind,
        operation: item.operation,
        step: item.step,
        outcome: item.outcome,
        acknowledgeable:
          complete &&
          item.ticket !== null &&
          provedRecoveryOutcomes.has(item.outcome),
      })),
    });
  }, []);

  const onFrameLoad = useCallback(
    (frame: HTMLIFrameElement) => {
      const current = sessionRef.current;
      const holder = current.wallet?.account.address;
      if (!holder || state.status === "ended") return;
      host.current?.close();
      // A new host lists recovery afresh; the replaced host's tickets never
      // acknowledge anything.
      recoveryState.current = undefined;
      const face = { slug, launchId };
      // This launch's own host, live: not ended, not replaced, not torn down.
      const launched: { host?: ProductFaceBridgeHost } = {};
      const liveHost = () =>
        Boolean(launched.host) &&
        host.current === launched.host &&
        launched.host?.session.ended === null;
      // contract r18: the step's launch binding, enforced server-side on
      // prepare and execute, and the identity re-checked at every async
      // boundary inside the executor (prepare, signing, execute).
      const execution = (operationId: string, as: ExecutorIdentity) =>
        faceExecutionOf({
          face,
          operationId,
          expected: as,
          current: () => executorIdentityOf(sessionRef.current),
          live: liveHost,
        });
      const guard = async <T>(work: () => Promise<T>) => {
        try {
          return await work();
        } catch (error) {
          if (error instanceof ProductFaceError && error.status === 401) {
            void sessionRef.current.refresh();
          }
          // The launch journal is full of steps whose authority already left
          // (kept, never evicted): the face cannot proceed in this launch, so
          // the host offers a new one. The face still hears the refusal.
          if (
            error instanceof ProductFaceError &&
            error.code === "journal_full" &&
            liveHost()
          ) {
            setNotice({ kind: "launch_full", reason: "journal_full" });
          }
          throw error;
        }
      };
      const handlers: ProductFaceHandlers = {
        listProducts: ({ templateId, next }) =>
          guard(() =>
            listProgrammeProducts({ owner: holder, templateId, next }),
          ),
        selectProduct: (objectId) =>
          guard(() => selectProgrammeProduct(face, objectId)),
        readProduct: (objectId) => guard(() => readProgrammeProduct(objectId)),
        readActions: (objectId) =>
          guard(() => readProgrammeProductActions(objectId)),
        readAttributes: (objectId) =>
          guard(() => readProgrammeProductAttributes(objectId)),
        readHistory: (objectId) =>
          guard(() => readProgrammeProductHistory(objectId)),
        readUnit: (objectId) => guard(() => readProgrammeUnit(face, objectId)),
        journal: (request) =>
          guard(() =>
            writeFaceJournal(
              face,
              request as unknown as Record<string, unknown>,
            ),
          ),
        operationStatus: (operationId) =>
          guard(() => readFaceOperationStatus(face, operationId)),
        mintAssertion: (request) =>
          guard(() => mintFaceAssertion(face, request)),
        readSettleProposal: (input) =>
          guard(() => readSettleProposal(face, input)),
        executorIdentity: () => executorIdentityOf(sessionRef.current),
        // Defence in depth: the executors themselves sign only while this
        // launch is live and the CURRENT wallet session is exactly the one
        // that began the operation; otherwise they refuse before anything is
        // prepared or signed (an account change never signs with the new
        // account's credentials).
        executeSettle: ({ operationId, ...input }, as) =>
          executeAs(
            as,
            executorIdentityOf(sessionRef.current),
            liveHost(),
            (identity) =>
              executeSettleAction({
                ...input,
                authenticationMethod: identity.authenticationMethod,
                controllerAddress: identity.controller ?? undefined,
                face: execution(operationId, as),
              }),
          ),
        readTransferProposal: (input) =>
          guard(() => readTransferProposal(face, input)),
        readAcceptOffer: () => guard(() => readAcceptOffer(face)),
        executeTransfer: ({ operationId, ...input }, as) =>
          executeAs(
            as,
            executorIdentityOf(sessionRef.current),
            liveHost(),
            (identity) =>
              executeTransferAction({
                ...input,
                authenticationMethod: identity.authenticationMethod,
                controllerAddress: identity.controller ?? undefined,
                face: execution(operationId, as),
              }),
          ),
        transferProgress: (operationId, offerId) =>
          guard(() => readTransferProgress(face, operationId, offerId)),
        confirm: (request) =>
          new Promise<boolean>((resolve) => {
            // One native confirmation per face; the capability enforces it too.
            pendingConfirmation.current?.resolve(false);
            confirmationId.current += 1;
            const id = confirmationId.current;
            pendingConfirmation.current = { id, resolve };
            dispatchConfirmation({ type: "open", id, request });
          }),
        notice: (next) => setNotice(next),
        navigate: (path, mode) => {
          lastTask.current = path;
          const href = productTaskHref(slug, path);
          if (mode === "replace") router.replace(href, { scroll: false });
          else router.push(href, { scroll: false });
        },
        sha256: sha256Hash,
      };
      launched.host = startProductFaceBridge({
        frame,
        frameUrl,
        application,
        holder,
        task,
        // contract r14: a handover the context read took for this launch;
        // handed to the face once, on the register task only (G8: an
        // acceptance ticket, on the accept task only).
        handover: takeFaceHandoverTicket(launchId),
        handlers,
        onInitialized: (started) => {
          dispatch({ type: "live" });
          // After a reload, journalled operations whose authority already left
          // the wallet are reconciled read-only and reported; never re-minted.
          // As below, only this launch's own live host reads or reports.
          void listFaceOperations(face)
            .then(async (operations) => {
              for (const operation of operations) {
                // A transfer step's status is the runtime's, read below; it is
                // not a registration.
                if (
                  operation.kind === "transfer" ||
                  (operation.phase !== "assertion_issued" &&
                    operation.phase !== "submitted")
                ) {
                  continue;
                }
                if (!liveHost()) return;
                const status = await readFaceOperationStatus(
                  face,
                  operation.operation_id,
                ).catch(() => undefined);
                if (!liveHost()) return;
                if (status) {
                  started.operationUpdated(
                    operation.operation_id,
                    status.status,
                  );
                }
              }
            })
            .catch(() => undefined);
          // A transfer step this wallet sent from another launch (a sign-in
          // since, a relaunch) and not settled: the sender can no longer list
          // or select the moved product, so the face cannot ask. Its ORIGINAL
          // correlation is read once here, read-only (the runtime verifies the
          // recorded action, signer, recipient and proof); nothing is signed,
          // reserved or sent again, and only the runtime's answer is reported.
          // Each await may outlive this launch (a frame reload, a teardown, a
          // sign-out or another account): only this launch's own live host
          // dispatches a read or shows the answer.
          const readRetainedTransferSteps = () => {
            void listRetainedTransferSteps(face)
              .then(async (steps) => {
                for (const step of steps) {
                  if (step.kind !== "transfer" || step.phase !== "submitted") {
                    continue;
                  }
                  if (!liveHost()) return;
                  const progress = await readTransferProgress(
                    face,
                    step.operation_id,
                  ).catch(() => undefined);
                  if (!liveHost()) return;
                  if (
                    progress?.status === "transferred" ||
                    progress?.status === "outcome_unknown"
                  ) {
                    setNotice({
                      kind: "transfer_step",
                      reason: progress.status,
                    });
                  }
                }
              })
              .catch(() => undefined);
          };
          // Proposed contract r20 (PROPOSED, not deployed; no runtime answers
          // it today): the runtime's own durable listing of this wallet's
          // earlier operations, resolved read-only by the BFF, supersedes the
          // cookie-based retained listing above when the face's runtimes
          // support it. The host only shows the listed outcomes and keeps the
          // tickets of the items it may acknowledge once the person has seen
          // them (dismissNotice). Nothing listed is ever re-sent. A runtime
          // without r20, or a listing the BFF could not read, fails closed:
          // nothing is acknowledged and today's retained read runs unchanged.
          void collectRecovery(face, liveHost)
            .then(
              (recovery) => {
                if (!liveHost()) return;
                if (!recovery.supported) {
                  readRetainedTransferSteps();
                  return;
                }
                recoveryState.current = {
                  face,
                  items: new Map(
                    recovery.items.map((item) => [item.operation_id, item]),
                  ),
                  scanComplete: recovery.scanComplete,
                  readFailed: recovery.readFailed,
                  continuation: recovery.continuation,
                };
                showRecovery();
              },
              () => {
                if (liveHost()) readRetainedTransferSteps();
              },
            )
            .catch(() => undefined);
        },
      });
      host.current = launched.host;
    },
    [
      application,
      frameUrl,
      launchId,
      router,
      showRecovery,
      slug,
      state.status,
      task,
    ],
  );

  // Proposed contract r20: dismissing the recovery notice is the person
  // having seen it, the last condition for acknowledging the items the BFF
  // ticketed (proved, complete check, enabled journey). The tickets are taken
  // once (never twice), and only while this host is still live: not ended,
  // not replaced, not torn down. Each acknowledgement is fire-and-forget and
  // read-only for the business record; its failure changes nothing here.
  const acknowledgeRecovery = () => {
    const current = recoveryState.current;
    if (!current || host.current?.session.ended !== null) return;
    // Defence in depth beside the BFF's ticketing: only a proved outcome,
    // and only when every scan was complete and every page was read. The
    // tickets are taken once: an acknowledged item is dropped from the state
    // (the runtime no longer lists it either).
    if (!current.scanComplete || current.readFailed) return;
    for (const [operationId, item] of current.items) {
      if (item.ticket === null || !provedRecoveryOutcomes.has(item.outcome)) {
        continue;
      }
      current.items.delete(operationId);
      void acknowledgeFaceRecovery(current.face, {
        operation_id: operationId,
        ticket: item.ticket,
      }).catch(() => undefined);
    }
  };

  /**
   * Continue checking from this launch's continuation: the next pages of the
   * same listing, deterministically, merged into what is shown. Only this
   * live launch's own state; a check with nothing left to continue is a no-op.
   */
  const continueRecovery = () => {
    const current = recoveryState.current;
    if (
      !current ||
      current.continuation === null ||
      host.current?.session.ended !== null
    ) {
      return;
    }
    const live = () =>
      recoveryState.current === current && host.current?.session.ended === null;
    void collectRecovery(current.face, live, current.continuation)
      .then((more) => {
        if (!live() || !more.supported) return;
        for (const item of more.items)
          current.items.set(item.operation_id, item);
        current.scanComplete = current.scanComplete && more.scanComplete;
        current.readFailed = more.readFailed;
        current.continuation = more.continuation;
        showRecovery();
      })
      .catch(() => undefined);
  };

  return {
    state,
    confirmation: confirmation.status === "open" ? confirmation.request : null,
    answerConfirmation,
    onFrameLoad,
    notice,
    dismissNotice: () => {
      if (notice?.kind === "recovery") acknowledgeRecovery();
      setNotice(null);
    },
    continueRecovery,
  };
}
