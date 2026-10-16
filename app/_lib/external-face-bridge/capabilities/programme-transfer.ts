import {
  ProductFaceError,
  registrationReadback,
} from "@/app/_domain/product-face";
import {
  checkTransferProposal,
  isOfferId,
  transferHostOperation,
  transferJournalOperation,
  transferProposalHashInput,
} from "@/app/_domain/product-face-transfer";
import { isOperationId } from "@/app/_domain/product-face";
import type { ProductFaceCapability } from "@/app/_lib/external-face-bridge/capabilities/product-types";
import {
  assertStillCurrent,
  assertStillExecutable,
  beginningExecutor,
  callWalletService as call,
  requireContext,
} from "@/app/_lib/external-face-bridge/capabilities/programme-products";
import { ExternalFaceBridgeError } from "@/app/_lib/external-face-bridge/core/errors";
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
 * selected unit and that recipient (the request step against the deployment's
 * exact binding.transferRequest template, contract r17 complete custom map;
 * without that template the operation is not granted), shows its own native
 * confirmation (the
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
        // The request step's exact template; absent: not granted (fail closed).
        const rules = session.application.transferRequest;
        if (!rules) throw faceError("capability_not_granted");
        if (session.pendingConfirmation) throw faceError("action_in_progress");
        // Who began this operation: only exactly this wallet session may sign it.
        const executor = beginningExecutor(
          session,
          handlers.executorIdentity(),
        );

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
          // A step that already left this wallet (its retained journal entry,
          // across reloads, relaunches and sign-ins, under this operation id or,
          // for this offer, under the one it was sent with) is only ever read
          // back, before any ownership read: once its custody has moved, the
          // sender no longer sees the object, and that is not "nothing was sent".
          // The BFF answers unknown_operation (never journalled) or
          // operation_conflict (journalled, not submitted) without the
          // runtime; only then is the step signed here.
          const retained = await handlers
            .transferProgress(stepId, offerId)
            .then(
              (progress) => ({ progress }),
              (error: unknown) => ({ error }),
            );
          if ("progress" in retained) {
            if (retained.progress.status === "outcome_unknown") {
              throw faceError("outcome_unknown");
            }
            return {
              status: retained.progress.status,
              step: retained.progress.step,
            };
          }
          if (!(
            retained.error instanceof ProductFaceError &&
            ["unknown_operation", "operation_conflict"].includes(
              retained.error.code,
            )
          )) {
            // The journal could not be read: a step this launch issued stays
            // unknown; anything else is refused as the read failed.
            if (session.issuedOperations.has(stepId)) {
              throw faceError("outcome_unknown");
            }
            throw toBridgeError(retained.error);
          }
          let fresh: Awaited<ReturnType<typeof handlers.readProduct>>;
          try {
            fresh = await call(() => handlers.readProduct(selection.objectId));
          } catch (error) {
            // Defence in depth: a step this launch issued is never reported
            // as not sent because its object is no longer visible.
            if (session.issuedOperations.has(stepId)) return await readBack();
            throw error;
          }
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
          // Re-checked here against this host's own fresh read: the BFF's
          // checks are the authority, and this one keeps a misbehaving answer
          // from ever reaching the executor.
          const readback = registrationReadback(
            fresh.owner,
            session.holder,
            fresh.custom,
            session.application.canonicalRegistration,
          );
          const check = checkTransferProposal(
            proposal,
            {
              offerId,
              objectId: selection.objectId,
              holder: session.holder,
              now: Date.now(),
              recipientReferenceHash: await handlers.sha256(proposal.recipient),
            },
            { currentCustom: fresh.custom, rules },
          );
          if (
            !check.ok ||
            (proposal.step === "request" &&
              (!readback.state ||
                !rules.fromStates.includes(readback.state))) ||
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
              // Refused by the BFF before anything was sent to the runtime.
              [
                "stale_context",
                "not_owned",
                "proposal_rejected",
                "capability_not_granted",
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
          // The reservation was won for THIS session, launch and selection.
          // Anything that changed during that await (logout, expiry, an
          // account change, a torn-down launch, another selection) means the
          // step is never executed from here: the submitted journal entry
          // keeps its original correlation, its status reads outcome_unknown,
          // and only the reviewed recovery can release it. No cancel, no
          // retry, no second reservation.
          try {
            assertStillExecutable(
              session,
              selection,
              executor,
              handlers.executorIdentity(),
            );
          } catch (error) {
            if (
              error instanceof ExternalFaceBridgeError &&
              error.code === "stale_context"
            ) {
              throw faceError("outcome_unknown");
            }
            throw error;
          }
          let actionId: string;
          try {
            ({ actionId } = await handlers.executeTransfer(
              {
                operationId: stepId,
                objectId: selection.objectId,
                action: proposal.action,
                input: proposal.input,
              },
              executor,
            ));
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
