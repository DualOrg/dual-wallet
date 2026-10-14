import {
  isCaseId,
  isCurrencyCode,
  isDecimalAmount,
  isHostOnlyRuntimeOperation,
  isObjectId,
  isOperationId,
  isQuoteOperation,
  isQuoteVersion,
  isRequestHash,
  isRuntimeOperation,
  isRuntimeWriteOperation,
  ProductFaceError,
  runtimeOperationNeedsCase,
  type RuntimeOperation,
} from "@/app/_domain/product-face";
import type { ProductFaceCapability } from "@/app/_lib/external-face-bridge/capabilities/product-types";
import { callWalletService as call } from "@/app/_lib/external-face-bridge/capabilities/programme-products";
import type { RuntimeAssertionTarget } from "@/app/_lib/external-face-bridge/core/product-context";
import {
  faceError,
  toBridgeError,
} from "@/app/_lib/external-face-bridge/core/product-session";
import {
  exactKeys,
  isRecord,
} from "@/app/_lib/external-face-bridge/core/protocol";

export const runtimeAuthorizeOperation = "programme.runtime.authorize";

const NOT_ISSUED = new Set([
  "face_assertion_unprovisioned",
  "assertion_limit",
  "invalid_origin",
  "quote_changed",
  "stale_context",
]);

function parseTarget(
  value: unknown,
  operation: RuntimeOperation,
): RuntimeAssertionTarget | undefined {
  if (!isRecord(value)) return undefined;
  const quote = isQuoteOperation(operation);
  const keys = quote
    ? ["object_id", "case_id", "quote_version", "amount", "currency"]
    : ["object_id", "case_id"];
  if (!exactKeys(value, keys) || !isObjectId(value.object_id)) return;
  const needsCase = runtimeOperationNeedsCase(operation);
  if (needsCase ? !isCaseId(value.case_id) : value.case_id !== undefined) {
    return undefined;
  }
  if (
    quote &&
    (!isQuoteVersion(value.quote_version) ||
      !isDecimalAmount(value.amount) ||
      !isCurrencyCode(value.currency))
  ) {
    return undefined;
  }
  return {
    object_id: value.object_id,
    ...(needsCase ? { case_id: value.case_id as string } : {}),
    ...(quote
      ? {
          quote_version: value.quote_version as string,
          amount: value.amount as string,
          currency: value.currency as string,
        }
      : {}),
  };
}

/**
 * One fresh, one-time assertion for one exact runtime request. Reads need no
 * dialog; case writes need the host's own confirmation and a journal entry
 * first. A quote decision shows the quote the wallet read from the runtime
 * itself and binds it into the target; if the face's quote differs the
 * request is refused with quote_changed — never auto-approved.
 */
export function runtimeCapabilities(): ProductFaceCapability[] {
  return [
    {
      operation: runtimeAuthorizeOperation,
      async resolve(payload, { session, handlers }) {
        if (
          !isRecord(payload) ||
          !exactKeys(payload, [
            "operation",
            "operation_id",
            "target",
            "request_hash",
          ]) ||
          !isRuntimeOperation(payload.operation) ||
          payload.operation === "registration.submit" ||
          // The settle proposal and reservation are the host's own calls.
          isHostOnlyRuntimeOperation(payload.operation) ||
          !isOperationId(payload.operation_id) ||
          !isRequestHash(payload.request_hash)
        ) {
          throw faceError("invalid_request");
        }
        const operation = payload.operation;
        const operationId = payload.operation_id;
        const requestHash = payload.request_hash;
        const target = parseTarget(payload.target, operation);
        if (!target) throw faceError("invalid_request");
        session.assertLive();

        if (operation === "registration.status") {
          const assertion = await call(() =>
            handlers.mintAssertion({
              operation,
              operation_id: operationId,
              target,
              request_hash: requestHash,
            }),
          );
          session.assertLive();
          return { assertion };
        }

        const selection = session.selection;
        if (!selection) throw faceError("no_selection");
        if (target.object_id !== selection.objectId) {
          throw faceError("stale_context");
        }

        if (!isRuntimeWriteOperation(operation)) {
          const assertion = await call(() =>
            handlers.mintAssertion({
              operation,
              operation_id: operationId,
              target,
              request_hash: requestHash,
              context_id: selection.contextId,
            }),
          );
          // A private read for a context that is no longer selected is dropped.
          session.assertLive();
          if (session.selection?.contextId !== selection.contextId) {
            throw faceError("stale_context");
          }
          return { assertion };
        }

        if (session.pendingConfirmation) throw faceError("action_in_progress");
        session.pendingConfirmation = true;
        let begun = false;
        const cancel = () =>
          handlers
            .journal({ transition: "cancel", operation_id: operationId })
            .catch(() => undefined);
        try {
          const begin = await call(() =>
            handlers.journal({
              transition: "begin",
              kind: "runtime",
              operation,
              operation_id: operationId,
              object_id: selection.objectId,
              context_id: selection.contextId,
              ...(target.case_id ? { case_id: target.case_id } : {}),
            }),
          );
          begun = true;
          session.assertLive();
          if (isQuoteOperation(operation)) {
            const quote = begin.quote;
            if (
              !quote ||
              quote.caseId !== target.case_id ||
              quote.quoteVersion !== target.quote_version ||
              quote.amount !== target.amount ||
              quote.currency !== target.currency
            ) {
              await cancel();
              begun = false;
              throw faceError("quote_changed");
            }
          }
          const confirmed = await handlers.confirm({
            kind: "runtime",
            operation,
            product: {
              objectId: selection.objectId,
              name: selection.product.name,
            },
            ...(target.case_id ? { caseId: target.case_id } : {}),
            ...(begin.quote ? { quote: begin.quote } : {}),
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
              operation_id: operationId,
              context_id: selection.contextId,
            }),
          );
          let assertion: string;
          try {
            assertion = await handlers.mintAssertion({
              operation,
              operation_id: operationId,
              target,
              request_hash: requestHash,
              context_id: selection.contextId,
            });
          } catch (error) {
            if (
              error instanceof ProductFaceError &&
              NOT_ISSUED.has(error.code)
            ) {
              await cancel();
            }
            begun = false;
            throw error;
          }
          begun = false;
          session.issuedOperations.add(operationId);
          // An approved write may complete even if the selection moved on.
          session.assertLive();
          return { assertion };
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
