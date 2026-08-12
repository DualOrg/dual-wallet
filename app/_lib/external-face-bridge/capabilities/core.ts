import type { ExternalFaceCapability } from "@/app/_lib/external-face-bridge/capabilities/types";
import { ExternalFaceBridgeError } from "@/app/_lib/external-face-bridge/core/errors";
import {
  BRIDGE_PROTOCOL,
  BRIDGE_VERSION,
  emptyPayload,
} from "@/app/_lib/external-face-bridge/core/protocol";

export const coreOperations = {
  ping: "bridge.ping",
} as const;

export function coreCapabilities(): ExternalFaceCapability[] {
  return [
    {
      operation: coreOperations.ping,
      resolve(payload) {
        if (!emptyPayload(payload)) {
          throw new ExternalFaceBridgeError(
            "invalid_request",
            "The ping request must have an empty payload.",
          );
        }
        return { protocol: BRIDGE_PROTOCOL, version: BRIDGE_VERSION };
      },
    },
  ];
}
