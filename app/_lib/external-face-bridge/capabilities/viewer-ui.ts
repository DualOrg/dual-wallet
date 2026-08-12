import type { ExternalFaceCapability } from "@/app/_lib/external-face-bridge/capabilities/types";
import { ExternalFaceBridgeError } from "@/app/_lib/external-face-bridge/core/errors";
import { emptyPayload } from "@/app/_lib/external-face-bridge/core/protocol";

export const viewerUiOperations = {
  openDetails: "viewer.details.open",
} as const;

export interface ExternalFaceViewerUiHandlers {
  openDetails?: () => void | Promise<void>;
}

export function viewerUiCapabilities(
  handlers: ExternalFaceViewerUiHandlers,
): ExternalFaceCapability[] {
  if (!handlers.openDetails) return [];
  return [
    {
      operation: viewerUiOperations.openDetails,
      async resolve(payload) {
        if (!emptyPayload(payload)) {
          throw new ExternalFaceBridgeError(
            "invalid_request",
            "The details request must have an empty payload.",
          );
        }
        await handlers.openDetails?.();
        return { opened: true };
      },
    },
  ];
}
