import type {
  ProductFaceCapability,
  ProductFaceRuntime,
} from "@/app/_lib/external-face-bridge/capabilities/product-types";
import { programmeCapabilities } from "@/app/_lib/external-face-bridge/capabilities/programme";
import { productCapabilities } from "@/app/_lib/external-face-bridge/capabilities/programme-products";
import { registrationCapabilities } from "@/app/_lib/external-face-bridge/capabilities/programme-registration";
import { runtimeCapabilities } from "@/app/_lib/external-face-bridge/capabilities/programme-runtime";
import { settleCapabilities } from "@/app/_lib/external-face-bridge/capabilities/programme-settle";
import { transferCapabilities } from "@/app/_lib/external-face-bridge/capabilities/programme-transfer";
import { faceError } from "@/app/_lib/external-face-bridge/core/product-session";
import type { BridgeRequest } from "@/app/_lib/external-face-bridge/core/protocol";

/**
 * The complete application-variant capability set. It deliberately contains
 * no object.* operation from the card/detail variants — in particular no
 * object.action.request — and no generic fetch, proxy, token or execute.
 */
export function productFaceCapabilities(): ProductFaceCapability[] {
  return [
    ...programmeCapabilities(),
    ...productCapabilities(),
    ...registrationCapabilities(),
    ...runtimeCapabilities(),
    ...settleCapabilities(),
    ...transferCapabilities(),
  ];
}

export function productFaceOperationNames() {
  return productFaceCapabilities().map(({ operation }) => operation);
}

export async function resolveProductFaceRequest(
  request: BridgeRequest,
  runtime: ProductFaceRuntime,
) {
  const capability = productFaceCapabilities().find(
    (candidate) => candidate.operation === request.operation,
  );
  if (!capability) throw new Error("capability_denied");
  if (runtime.session.ended) throw faceError("session_ended");
  return capability.resolve(request.payload, runtime);
}
