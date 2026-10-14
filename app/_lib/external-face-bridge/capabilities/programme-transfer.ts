import { ProductFaceError } from "@/app/_domain/product-face";
import {
  isOfferId,
  transferHostOperation,
  transferJournalOperation,
  transferProposalHashInput,
} from "@/app/_domain/product-face-transfer";
import { isOperationId } from "@/app/_domain/product-face";
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

export { transferHostOperation };

/**
 * G8 (contract r16 protectedTransfer.hostOperation). The holder's wallet
 * signs ONE reviewed transfer step for the selected owned product. The face
 * names only the context, its offer and a step operation id; the wallet
 * obtains the step itself from the bound runtime (trusted transfer.propose),
 * which also names the recipient the runtime bound from the recipient's own
 * wallet assertion. The wallet checks the exact action and input against the
 * selected unit and that recipient, shows its own native confirmation (the
 * product, that ownership moves, and the recipient's wallet), journals the
 * step BEFORE anything leaves the wallet, has the BFF reserve it at the
 * runtime, and executes as the holder through the existing executor ONLY on
 * this request's own dispatch:"won". Then it verifies the step. Anything else
 * (a replay, a lost answer, an error after submit) is outcome_unknown and is
 * only ever read back, never executed again: asking again with the same step
 * operation id reads its status. Never claim_ownership, never issuer
 * authority, never a face-supplied recipient.
 */
export function transferCapabilities(): ProductFaceCapability[] {
  return [
    {
      operation: transferHostOperation,
      async resolve(payload, { session, handlers }) {
        const selection = requireContext(payload, session, [
          "offer_id",
          "step_operation_id",
        ]);
        const { offer_id: offerId, step_operation_id: stepId } =
          payload as Record<string, unknown>;
        if (!isOfferId(offerId) || !isOperationId(stepId)) {
          throw faceError("invalid_request");
        }
        if (session.pendingConfirmation) throw faceError("action_in_progress");

        session.pendingConfirmation = true;
        let begun = false;
        const cancel = () =>
          handlers
            .journal({ transition: "cancel", operation_id: stepId })
            .catch(() => undefined);
        // A step that already left the wallet: read back only, never again.
        const readBack = async () => {
          const progress = await handlers
            .transferProgress(stepId)
            .catch(() => undefined);
          if (!progress || progress.status === "outcome_unknown") {
            throw faceError("outcome_unknown");
          }
          return { status: progress.status, step: progress.step };
        };
        try {
          const fresh = await call(() =>
            handlers.readProduct(selection.objectId),
          );
          assertStillCurrent(session, selection);
          if (!session.application.templateIds.includes(fresh.templateId)) {
            throw faceError("not_in_programme");
          }
          if (!session.ownsProduct(fresh)) {
            // After the transfer the old holder no longer owns the unit; a
            // step this launch already submitted can still be read back.
            if (session.issuedOperations.has(stepId)) return await readBack();
            throw faceError("not_owned");
          }

          let proposal;
          try {
            proposal = await handlers.readTransferProposal({
              contextId: selection.contextId,
              offerId,
              objectId: selection.objectId,
            });
          } catch (error) {
            // A step already reserved for this unit: only its status is read.
            if (
              error instanceof ProductFaceError &&
              error.code === "outcome_unknown"
            ) {
              return await readBack();
            }
            throw error;
          }
          assertStillCurrent(session, selection);
          // Re-checked here: the BFF's checks are the authority, and this one
          // keeps a misbehaving answer from ever reaching the executor.
          if (
            proposal.offerId !== offerId ||
            proposal.objectId !== selection.objectId ||
            proposal.expiresAt.getTime() <= Date.now() ||
            proposal.recipient.toLowerCase() === session.holder.toLowerCase() ||
            (proposal.step === "transfer"
              ? proposal.action !== "transfer" ||
                Object.keys(proposal.input).join(",") !== "to" ||
                String(proposal.input.to).toLowerCase() !== proposal.recipient
              : proposal.action !== "update") ||
            (await handlers.sha256(transferProposalHashInput(proposal))) !==
              proposal.proposalHash
          ) {
            throw faceError("proposal_rejected");
          }

          try {
            await handlers.journal({
              transition: "begin",
              kind: "transfer",
              operation: transferJournalOperation(proposal.step),
              operation_id: stepId,
              object_id: selection.objectId,
              context_id: selection.contextId,
              proposal_id: proposal.proposalId,
              offer_id: offerId,
            });
          } catch (error) {
            // A step that already left the wallet is never executed again.
            if (
              error instanceof ProductFaceError &&
              error.code === "operation_already_submitted"
            ) {
              return await readBack();
            }
            throw error;
          }
          begun = true;
          assertStillCurrent(session, selection);

          // The wallet's own confirmation: the product (host-read), that
          // ownership moves, and the runtime-bound recipient (host-read).
          const confirmed = await handlers.confirm({
            kind: "transfer",
            product: { objectId: selection.objectId, name: fresh.name },
            step: proposal.step,
            recipient: proposal.recipient,
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
              operation_id: stepId,
              context_id: selection.contextId,
            }),
          );
          // The BFF persists the step as submitted and reserves it at the
          // runtime before any execution; only this request's own "won" lets
          // the holder execute.
          let submitted;
          try {
            submitted = await handlers.journal({
              transition: "submit",
              operation_id: stepId,
              context_id: selection.contextId,
            });
          } catch (error) {
            if (
              error instanceof ProductFaceError &&
              [
                "stale_context",
                "not_owned",
                "assertion_limit",
                "face_assertion_unprovisioned",
              ].includes(error.code)
            ) {
              throw error;
            }
            begun = false;
            session.issuedOperations.add(stepId);
            // The runtime's offer decision went to a cancel or an expiry:
            // nothing was executed or permitted.
            if (
              error instanceof ProductFaceError &&
              error.code === "transfer_cancelled"
            ) {
              throw faceError("transfer_cancelled");
            }
            throw faceError("outcome_unknown");
          }
          begun = false;
          session.issuedOperations.add(stepId);
          if (submitted.reservation !== "won") {
            throw faceError("outcome_unknown");
          }
          let actionId: string;
          try {
            ({ actionId } = await handlers.executeTransfer({
              objectId: selection.objectId,
              action: proposal.action,
              input: proposal.input,
            }));
          } catch {
            throw faceError("outcome_unknown");
          }
          await handlers
            .journal({
              transition: "record_action",
              operation_id: stepId,
              action_id: actionId,
            })
            .catch(() => undefined);
          session.assertLive();
          return await readBack();
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
