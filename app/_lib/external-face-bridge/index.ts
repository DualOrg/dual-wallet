export {
  externalFaceApplicationMatches,
  externalFaceBridgeApplication,
  externalFaceBridgeOrigin,
  productFaceApplicationMatches,
  productFaceFrameMatches,
  productFaceFrameUrl,
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
export {
  startProductFaceBridge,
  type ProductFaceBridgeHost,
} from "@/app/_lib/external-face-bridge/core/product-transport";
export {
  ProductFaceSession,
  type AssertionRequest,
  type JournalTransitionRequest,
  type JournalTransitionResponse,
  type OperationStatusResponse,
  type ProductFaceHandlers,
} from "@/app/_lib/external-face-bridge/core/product-session";
export {
  productFaceCapabilities,
  productFaceOperationNames,
  resolveProductFaceRequest,
} from "@/app/_lib/external-face-bridge/capabilities/product-face";
export type { ProductProjection } from "@/app/_lib/external-face-bridge/core/product-context";
