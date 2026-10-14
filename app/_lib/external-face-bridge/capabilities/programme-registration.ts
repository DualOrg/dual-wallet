import {
  isObjectId,
  isOperationId,
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
          !exactKeys(payload, ["object_id", "operation_id"]) ||
          !isObjectId(payload.object_id) ||
          !isOperationId(payload.operation_id)
        ) {
          throw faceError("invalid_request");
        }
        session.assertLive();
        if (session.pendingConfirmation) throw faceError("action_in_progress");
        const objectId = payload.object_id;
        const operationId = payload.operation_id;
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
          const begin = await call(() =>
            handlers.journal({
              transition: "begin",
              kind: "registration",
              operation: "registration.submit",
              operation_id: operationId,
              object_id: objectId,
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
        const result = await call(() => handlers.operationStatus(operationId));
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
