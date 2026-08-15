import {
  ActionInputError,
  bridgeActionInput,
  isInventoryActionName,
  type ActionInput,
  type InventoryActionName,
} from "@/app/_services/inventory-actions";
import type { ExternalFaceCapability } from "@/app/_lib/external-face-bridge/capabilities/types";
import type { AuthenticatedExternalFaceContext } from "@/app/_lib/external-face-bridge/core/context";
import { ExternalFaceBridgeError } from "@/app/_lib/external-face-bridge/core/errors";
import {
  exactKeys,
  isRecord,
} from "@/app/_lib/external-face-bridge/core/protocol";

export const actionOperations = {
  request: "object.action.request",
} as const;

export interface ExternalFaceActionRequest {
  name: InventoryActionName;
  input: ActionInput;
}

export interface ExternalFaceActionResult {
  status: "completed";
  action_id: string;
}

export interface ExternalFaceActionHandlers {
  requestAction?: (
    request: ExternalFaceActionRequest,
  ) => Promise<ExternalFaceActionResult>;
}

function actionRequest(
  payload: unknown,
  context: AuthenticatedExternalFaceContext,
): ExternalFaceActionRequest {
  if (
    !isRecord(payload) ||
    !exactKeys(payload, ["name", "input"]) ||
    typeof payload.name !== "string" ||
    !isInventoryActionName(payload.name)
  ) {
    throw new ExternalFaceBridgeError(
      "invalid_request",
      "The action request is invalid.",
    );
  }
  if (!context.actions.includes(payload.name)) {
    throw new ExternalFaceBridgeError(
      "action_unavailable",
      "The requested action is not available for this object.",
    );
  }
  try {
    return {
      name: payload.name,
      input: bridgeActionInput(payload.name, payload.input),
    };
  } catch (error) {
    if (error instanceof ActionInputError) {
      throw new ExternalFaceBridgeError(
        "invalid_request",
        "The suggested action input is invalid.",
      );
    }
    throw error;
  }
}

export function actionCapabilities(
  handlers: ExternalFaceActionHandlers,
): ExternalFaceCapability[] {
  if (!handlers.requestAction) return [];
  return [
    {
      operation: actionOperations.request,
      resolve(payload, context) {
        return handlers.requestAction?.(actionRequest(payload, context));
      },
    },
  ];
}
