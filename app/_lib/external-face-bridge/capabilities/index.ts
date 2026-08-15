import {
  actionCapabilities,
  type ExternalFaceActionHandlers,
} from "@/app/_lib/external-face-bridge/capabilities/actions";
import {
  attributeCapabilities,
  type ExternalFaceAttributeHandlers,
} from "@/app/_lib/external-face-bridge/capabilities/attributes";
import { coreCapabilities } from "@/app/_lib/external-face-bridge/capabilities/core";
import { objectCapabilities } from "@/app/_lib/external-face-bridge/capabilities/object";
import type { ExternalFaceCapability } from "@/app/_lib/external-face-bridge/capabilities/types";
import {
  viewerUiCapabilities,
  type ExternalFaceViewerUiHandlers,
} from "@/app/_lib/external-face-bridge/capabilities/viewer-ui";
import type { AuthenticatedExternalFaceContext } from "@/app/_lib/external-face-bridge/core/context";
import type { BridgeRequest } from "@/app/_lib/external-face-bridge/core/protocol";

export interface ExternalFaceBridgeHandlers
  extends
    ExternalFaceAttributeHandlers,
    ExternalFaceActionHandlers,
    ExternalFaceViewerUiHandlers {}

export function externalFaceCapabilities(
  handlers: ExternalFaceBridgeHandlers,
  variant: AuthenticatedExternalFaceContext["variant"] = "detail",
): ExternalFaceCapability[] {
  const currentObjectCapabilities = objectCapabilities().filter(
    ({ operation }) =>
      variant === "detail" || operation === "object.current.read",
  );
  return [
    ...coreCapabilities(),
    ...currentObjectCapabilities,
    ...attributeCapabilities(handlers),
    ...actionCapabilities(handlers),
    ...viewerUiCapabilities(handlers),
  ];
}

export async function resolveExternalFaceBridgeRequest(
  request: BridgeRequest,
  context: AuthenticatedExternalFaceContext,
  handlers: ExternalFaceBridgeHandlers,
) {
  const capability = externalFaceCapabilities(handlers, context.variant).find(
    (candidate) => candidate.operation === request.operation,
  );
  if (!capability) throw new Error("capability_denied");
  return capability.resolve(request.payload, context);
}
