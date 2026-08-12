import { getObjectsApi, normalizeApiError } from "@/api/web-sdk-client";
import {
  ExternalFaceBridgeError,
  type ExternalFaceAttributeResult,
} from "@/app/_lib/external-face-bridge";
import type { InventoryActionName } from "@/app/_lib/inventory-actions";

export async function readExternalFaceAttributes(
  objectId: string,
): Promise<ExternalFaceAttributeResult> {
  try {
    const result = await getObjectsApi().listObjectAttributes({ objectId });
    return {
      attributes: result.attributes.map((attribute) => ({
        id: attribute.id,
        key: attribute.key,
        value: attribute.value,
        category: attribute.category,
        content_type: attribute.contentType,
        public: attribute._public,
        object_nonce: attribute.objectNonce,
        when_created: attribute.whenCreated.toISOString(),
        when_modified: attribute.whenModified.toISOString(),
      })),
    };
  } catch (error) {
    const normalized = await normalizeApiError(
      error,
      "Object attributes could not be loaded.",
    );
    throw new Error(normalized.message);
  }
}

export async function verifyExternalFaceAction(
  objectId: string,
  name: InventoryActionName,
) {
  try {
    const result = await getObjectsApi().listObjects({
      id: objectId,
      limit: 1,
      actions: true,
    });
    const object = result.items?.[0]?.object ?? result.objects[0];
    const available = result.actions
      ?.find((entry) => entry.templateId === object?.templateId)
      ?.actions.includes(name);
    if (!object || object.id !== objectId || !available) {
      throw new ExternalFaceBridgeError(
        "action_unavailable",
        "The requested action is no longer available for this object.",
      );
    }
  } catch (error) {
    if (error instanceof ExternalFaceBridgeError) throw error;
    const normalized = await normalizeApiError(
      error,
      "The action could not be verified.",
    );
    throw new Error(normalized.message);
  }
}
