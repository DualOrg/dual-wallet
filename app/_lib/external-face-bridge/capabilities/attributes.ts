import type { ExternalFaceCapability } from "@/app/_lib/external-face-bridge/capabilities/types";
import { ExternalFaceBridgeError } from "@/app/_lib/external-face-bridge/core/errors";
import { emptyPayload } from "@/app/_lib/external-face-bridge/core/protocol";

export const attributeOperations = {
  read: "object.attributes.read",
} as const;

export interface ExternalFaceAttribute {
  id: string;
  key: string;
  value: unknown;
  category?: string;
  content_type?: "text" | "json";
  public: boolean;
  object_nonce: number;
  when_created: string;
  when_modified: string;
}

export interface ExternalFaceAttributeResult {
  attributes: ExternalFaceAttribute[];
}

export interface ExternalFaceAttributeHandlers {
  readAttributes?: () => Promise<ExternalFaceAttributeResult>;
}

export function attributeCapabilities(
  handlers: ExternalFaceAttributeHandlers,
): ExternalFaceCapability[] {
  if (!handlers.readAttributes) return [];
  return [
    {
      operation: attributeOperations.read,
      resolve(payload) {
        if (!emptyPayload(payload)) {
          throw new ExternalFaceBridgeError(
            "invalid_request",
            "The attribute request must have an empty payload.",
          );
        }
        return handlers.readAttributes?.();
      },
    },
  ];
}
