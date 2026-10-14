import {
  checkSettleProposal,
  isOperationId,
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
 * decoded changes natively, journals the settle before execution and executes
 * it once through the existing executor as the holder. Never claim_ownership,
 * never issuer authority, never re-executed.
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

          const { proposal } = await call(() =>
            handlers.readSettleProposal({
              contextId: selection.contextId,
              operationId,
              objectId: selection.objectId,
            }),
          );
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
          // Persisted as submitted BEFORE execution: from here a lost result
          // is outcome_unknown and is reconciled read-only, never re-executed.
          await call(() =>
            handlers.journal({
              transition: "submit",
              operation_id: settleId,
              context_id: selection.contextId,
            }),
          );
          begun = false;
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
