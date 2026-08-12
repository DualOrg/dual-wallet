import type { ExternalFaceCapability } from "@/app/_lib/external-face-bridge/capabilities/types";
import { ExternalFaceBridgeError } from "@/app/_lib/external-face-bridge/core/errors";
import { emptyPayload } from "@/app/_lib/external-face-bridge/core/protocol";

export const objectOperations = {
  current: "object.current.read",
  subscribe: "object.changes.subscribe",
  unsubscribe: "object.changes.unsubscribe",
} as const;

function requireEmptyPayload(payload: unknown, message: string) {
  if (!emptyPayload(payload)) {
    throw new ExternalFaceBridgeError("invalid_request", message);
  }
}

export function objectCapabilities(): ExternalFaceCapability[] {
  return [
    {
      operation: objectOperations.current,
      resolve(payload, context) {
        requireEmptyPayload(
          payload,
          "The current-object request must have an empty payload.",
        );
        return context.object;
      },
    },
    {
      operation: objectOperations.subscribe,
      resolve(payload) {
        requireEmptyPayload(
          payload,
          "The subscription request must have an empty payload.",
        );
        return { subscribed: true };
      },
    },
    {
      operation: objectOperations.unsubscribe,
      resolve(payload) {
        requireEmptyPayload(
          payload,
          "The subscription request must have an empty payload.",
        );
        return { subscribed: false };
      },
    },
  ];
}
