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
  executeSettleAction,
  executeTransferAction,
  listFaceOperations,
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
} from "@/app/_services/product-face.client";

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

  const onFrameLoad = useCallback(
    (frame: HTMLIFrameElement) => {
      const current = sessionRef.current;
      const holder = current.wallet?.account.address;
      if (!holder || state.status === "ended") return;
      host.current?.close();
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
        transferProgress: (operationId) =>
          guard(() => readTransferProgress(face, operationId)),
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
          void listFaceOperations(face)
            .then(async (operations) => {
              for (const operation of operations) {
                // A transfer step's status is the runtime's (the face asks
                // through transfer.sign again); it is not a registration.
                if (
                  operation.kind === "transfer" ||
                  (operation.phase !== "assertion_issued" &&
                    operation.phase !== "submitted")
                ) {
                  continue;
                }
                const status = await readFaceOperationStatus(
                  face,
                  operation.operation_id,
                ).catch(() => undefined);
                if (status) {
                  started.operationUpdated(
                    operation.operation_id,
                    status.status,
                  );
                }
              }
            })
            .catch(() => undefined);
        },
      });
      host.current = launched.host;
    },
    [application, frameUrl, launchId, router, slug, state.status, task],
  );

  return {
    state,
    confirmation: confirmation.status === "open" ? confirmation.request : null,
    answerConfirmation,
    onFrameLoad,
    notice,
    dismissNotice: () => setNotice(null),
  };
}
