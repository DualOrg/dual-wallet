import {
  isObjectId,
  isOperationId,
  isRecordId,
  isRequestHash,
  ProductFaceError,
} from "@/app/_domain/product-face";
import type { ProductFaceCapability } from "@/app/_lib/external-face-bridge/capabilities/product-types";
import { callWalletService as call } from "@/app/_lib/external-face-bridge/capabilities/programme-products";
import {
  faceError,
  toBridgeError,
} from "@/app/_lib/external-face-bridge/core/product-session";
import {
  exactKeys,
  isRecord,
} from "@/app/_lib/external-face-bridge/core/protocol";

export const registrationOperations = {
  authorize: "programme.registration.authorize",
  status: "programme.operation.status",
} as const;

// Server refusals that prove no assertion left the wallet.
const NOT_ISSUED = new Set([
  "face_assertion_unprovisioned",
  "assertion_limit",
  "invalid_origin",
]);

/**
 * Register product is the Passport first-owner handoff. It never maps to the
 * Dual `claim_ownership` action: the wallet's only authority here is a
 * one-time `registration.submit` assertion, issued after native confirmation
 * and after the operation is journalled outside the iframe.
 */
export function registrationCapabilities(): ProductFaceCapability[] {
  return [
    {
      operation: registrationOperations.authorize,
      async resolve(payload, { session, handlers }) {
        if (
          !isRecord(payload) ||
          !exactKeys(payload, [
            "object_id",
            "operation_id",
            "record_id",
            "request_hash",
          ]) ||
          !isObjectId(payload.object_id) ||
          !isOperationId(payload.operation_id) ||
          !isRecordId(payload.record_id) ||
          !isRequestHash(payload.request_hash)
        ) {
          throw faceError("invalid_request");
        }
        session.assertLive();
        if (session.pendingConfirmation) throw faceError("action_in_progress");
        const objectId = payload.object_id;
        const operationId = payload.operation_id;
        const recordId = payload.record_id;
        // r6: the face's hash over its entire exact runtime request, carried
        // unchanged into the assertion; the runtime recomputes it.
        const requestHash = payload.request_hash;
        session.pendingConfirmation = true;
        let begun = false;
        try {
          const unit = await call(() => handlers.readUnit(objectId));
          session.assertLive();
          if (unit.registration === "registered") {
            throw faceError("already_registered_to_you");
          }
          if (unit.readback.ownerIsYou) {
            throw faceError("ownership_moved_state_pending");
          }
          if (unit.recordId !== recordId) throw faceError("record_mismatch");
          const begin = await call(() =>
            handlers.journal({
              transition: "begin",
              kind: "registration",
              operation: "registration.submit",
              operation_id: operationId,
              object_id: objectId,
              record_id: recordId,
              request_hash: requestHash,
            }),
          );
          begun = true;
          session.assertLive();
          const confirmed = await handlers.confirm({
            kind: "registration",
            unit: begin.unit ?? unit,
          });
          session.assertLive();
          if (!confirmed) {
            await handlers
              .journal({ transition: "cancel", operation_id: operationId })
              .catch(() => undefined);
            begun = false;
            throw faceError("user_cancelled");
          }
          await call(() =>
            handlers.journal({
              transition: "confirm",
              operation_id: operationId,
            }),
          );
          session.assertLive();
          let assertion: string;
          try {
            assertion = await handlers.mintAssertion({
              operation: "registration.submit",
              operation_id: operationId,
              target: { object_id: objectId },
              request_hash: requestHash,
            });
          } catch (error) {
            if (
              error instanceof ProductFaceError &&
              NOT_ISSUED.has(error.code)
            ) {
              await handlers
                .journal({ transition: "cancel", operation_id: operationId })
                .catch(() => undefined);
            }
            begun = false;
            throw error;
          }
          begun = false;
          session.issuedOperations.add(operationId);
          session.assertLive();
          return { status: "authorized", operation_id: operationId, assertion };
        } catch (error) {
          if (begun) {
            await handlers
              .journal({ transition: "cancel", operation_id: operationId })
              .catch(() => undefined);
          }
          throw toBridgeError(error);
        } finally {
          session.pendingConfirmation = false;
        }
      },
    },
    {
      operation: registrationOperations.status,
      async resolve(payload, { session, handlers }) {
        if (
          !isRecord(payload) ||
          !exactKeys(payload, ["operation_id"]) ||
          !isOperationId(payload.operation_id)
        ) {
          throw faceError("invalid_request");
        }
        session.assertLive();
        const operationId = payload.operation_id;
        let result;
        try {
          result = await handlers.operationStatus(operationId);
        } catch (error) {
          // Not in this launch's journal (another tab, a reload or a fresh
          // sign-in): the host cannot tell, so it says so; the face then
          // reconciles read-only with the runtime. Never a failure or success.
          if (
            error instanceof ProductFaceError &&
            error.code === "unknown_operation"
          ) {
            session.assertLive();
            return {
              operation_id: operationId,
              status: "outcome_unknown",
              object_id: null,
              readback: null,
            };
          }
          throw toBridgeError(error);
        }
        session.assertLive();
        // Read-only: never retried, re-minted or re-executed. An issued
        // operation not yet reflected in readback is pending only while this
        // live host still carries it; after a reload it is outcome_unknown.
        const status =
          result.status === "outcome_unknown" &&
          session.issuedOperations.has(operationId)
            ? "pending"
            : result.status;
        return {
          operation_id: operationId,
          status,
          object_id: result.objectId,
          readback: result.readback
            ? {
                owner_is_you: result.readback.ownerIsYou,
                state: result.readback.state,
              }
            : null,
        };
      },
    },
  ];
}
