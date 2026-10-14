import {
  checkSettleProposal,
  isOperationId,
  isSettleProposalUnavailableReason,
  ProductFaceError,
  proposalHashInput,
  registrationReadback,
} from "@/app/_domain/product-face";
import type { ProductFaceCapability } from "@/app/_lib/external-face-bridge/capabilities/product-types";
import {
  assertStillCurrent,
  callWalletService as call,
  requireContext,
} from "@/app/_lib/external-face-bridge/capabilities/programme-products";
import {
  faceError,
  toBridgeError,
} from "@/app/_lib/external-face-bridge/core/product-session";

export const settleOperation = "programme.product.settle.request";

/**
 * G6 holder settle of `ownership_moved_state_pending`. The face names only
 * the context and operations; the wallet obtains the proposal itself from the
 * bound runtime, validates it against the reviewed template, shows the exact
 * decoded changes natively and journals the settle. Before any execution the
 * BFF reserves it at the runtime (contract r8/r11); the holder action runs
 * through the existing executor only when that reservation answered
 * dispatch:"won" to this request. Anything else (a replay, already claimed or
 * reserved, any error, a timeout or a lost answer) is outcome_unknown and is
 * reconciled read-only through registration.settle.status. Never
 * claim_ownership, never issuer authority, never re-executed or re-reserved.
 */
export function settleCapabilities(): ProductFaceCapability[] {
  return [
    {
      operation: settleOperation,
      async resolve(payload, { session, handlers }) {
        const selection = requireContext(payload, session, [
          "operation_id",
          "settle_operation_id",
        ]);
        const { operation_id: operationId, settle_operation_id: settleId } =
          payload as Record<string, unknown>;
        if (!isOperationId(operationId) || !isOperationId(settleId)) {
          throw faceError("invalid_request");
        }
        if (session.pendingConfirmation) throw faceError("action_in_progress");
        const settle = session.application.settle;
        if (!settle) throw faceError("proposal_rejected");

        session.pendingConfirmation = true;
        let begun = false;
        const cancel = () =>
          handlers
            .journal({ transition: "cancel", operation_id: settleId })
            .catch(() => undefined);
        try {
          const fresh = await call(() =>
            handlers.readProduct(selection.objectId),
          );
          assertStillCurrent(session, selection);
          if (!session.application.templateIds.includes(fresh.templateId)) {
            throw faceError("not_in_programme");
          }
          if (!session.ownsProduct(fresh)) throw faceError("not_owned");
          const readback = registrationReadback(
            fresh.owner,
            session.holder,
            fresh.custom,
            session.application.canonicalRegistration,
          );
          if (
            !readback.state ||
            !settle.fromStates.includes(readback.state) ||
            !session.application.canonicalRegistration.unconfirmedStates.includes(
              readback.state,
            )
          ) {
            throw faceError("settle_not_required");
          }

          let proposal;
          try {
            ({ proposal } = await handlers.readSettleProposal({
              contextId: selection.contextId,
              operationId,
              objectId: selection.objectId,
            }));
          } catch (error) {
            // G6b: the runtime states why there is no proposal; the host shows
            // that reason itself and invents nothing.
            if (
              error instanceof ProductFaceError &&
              error.code === "settle_proposal_unavailable" &&
              isSettleProposalUnavailableReason(error.reason)
            ) {
              handlers.notice?.({
                kind: "settle_proposal_unavailable",
                reason: error.reason,
              });
            }
            throw error;
          }
          assertStillCurrent(session, selection);
          const check = checkSettleProposal(
            proposal,
            { operationId, objectId: selection.objectId, now: Date.now() },
            fresh.custom,
            settle,
            session.application.canonicalRegistration,
          );
          if (
            !check.ok ||
            (await handlers.sha256(proposalHashInput(proposal))) !==
              proposal.proposalHash
          ) {
            throw faceError("proposal_rejected");
          }
          const available = await call(() =>
            handlers.readActions(selection.objectId),
          );
          assertStillCurrent(session, selection);
          if (!available.includes(settle.action)) {
            throw faceError("proposal_rejected");
          }

          try {
            await handlers.journal({
              transition: "begin",
              kind: "settle",
              operation: settle.action,
              operation_id: settleId,
              object_id: selection.objectId,
              context_id: selection.contextId,
              proposal_id: proposal.proposalId,
            });
          } catch (error) {
            // A settle that already left the wallet is never re-executed.
            if (
              error instanceof ProductFaceError &&
              error.code === "operation_already_submitted"
            ) {
              throw faceError("outcome_unknown");
            }
            throw error;
          }
          begun = true;
          assertStillCurrent(session, selection);

          const confirmed = await handlers.confirm({
            kind: "settle",
            product: {
              objectId: selection.objectId,
              name: fresh.name,
            },
            action: settle.action,
            changes: check.changes,
          });
          session.assertLive();
          if (!confirmed) {
            await cancel();
            begun = false;
            throw faceError("user_cancelled");
          }
          await call(() =>
            handlers.journal({
              transition: "confirm",
              operation_id: settleId,
              context_id: selection.contextId,
            }),
          );
          // The BFF persists the settle as submitted and reserves it at the
          // runtime before any execution. Only a dispatch:"won" answer to this
          // request lets the holder execute; everything else (including a
          // lost answer to this call) is outcome_unknown, read-only from here.
          let submitted;
          try {
            submitted = await handlers.journal({
              transition: "submit",
              operation_id: settleId,
              context_id: selection.contextId,
            });
          } catch (error) {
            if (
              error instanceof ProductFaceError &&
              // Refused before anything was sent to the runtime.
              [
                "stale_context",
                "not_owned",
                "settle_not_required",
                "assertion_limit",
                "face_assertion_unprovisioned",
              ].includes(error.code)
            ) {
              throw error;
            }
            begun = false;
            throw faceError("outcome_unknown");
          }
          begun = false;
          if (submitted.reservation !== "won") {
            throw faceError("outcome_unknown");
          }
          let actionId: string;
          try {
            ({ actionId } = await handlers.executeSettle({
              objectId: selection.objectId,
              action: proposal.action,
              ...(settle.alias ? { alias: settle.alias } : {}),
              input: proposal.input,
            }));
          } catch {
            throw faceError("outcome_unknown");
          }
          await handlers
            .journal({
              transition: "record_action",
              operation_id: settleId,
              action_id: actionId,
            })
            .catch(() => undefined);
          session.assertLive();
          return {
            status: "submitted",
            settle_operation_id: settleId,
            action_id: actionId,
          };
        } catch (error) {
          if (begun) await cancel();
          throw toBridgeError(error);
        } finally {
          session.pendingConfirmation = false;
        }
      },
    },
  ];
}
