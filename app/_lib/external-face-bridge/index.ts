export {
  externalFaceApplicationMatches,
  externalFaceBridgeApplication,
  externalFaceBridgeOrigin,
  type ExternalFaceApplicationDescriptor,
} from "@/app/_lib/external-face-bridge/core/application";
export {
  toAuthenticatedExternalFaceDetailContext,
  toInventoryCardExternalFaceContext,
  type AuthenticatedExternalFaceContext,
  type ExternalFaceDetailObject,
  type ExternalFaceObject,
} from "@/app/_lib/external-face-bridge/core/context";
export { ExternalFaceBridgeError } from "@/app/_lib/external-face-bridge/core/errors";
export {
  startAuthenticatedExternalFaceBridge,
  type ExternalFaceBridgeHost,
} from "@/app/_lib/external-face-bridge/core/transport";
export {
  externalFaceCapabilities,
  resolveExternalFaceBridgeRequest,
  type ExternalFaceBridgeHandlers,
} from "@/app/_lib/external-face-bridge/capabilities";
export type {
  ExternalFaceActionRequest,
  ExternalFaceActionResult,
} from "@/app/_lib/external-face-bridge/capabilities/actions";
export type {
  ExternalFaceAttribute,
  ExternalFaceAttributeResult,
} from "@/app/_lib/external-face-bridge/capabilities/attributes";
