import { isTaskPath } from "@/app/_domain/product-face";
import type { ProductFaceCapability } from "@/app/_lib/external-face-bridge/capabilities/product-types";
import {
  emptyPayload,
  exactKeys,
  isRecord,
} from "@/app/_lib/external-face-bridge/core/protocol";
import { faceError } from "@/app/_lib/external-face-bridge/core/product-session";

export const programmeOperations = {
  ping: "bridge.ping",
  contextRead: "programme.context.read",
  taskUpdate: "navigation.task.update",
} as const;

// Plain text only: no control characters or markup delimiters.
const TITLE = /^[^\u0000-\u001f\u007f<>]{1,80}$/;

export function programmeCapabilities(): ProductFaceCapability[] {
  return [
    {
      operation: programmeOperations.ping,
      async resolve(payload) {
        if (!emptyPayload(payload)) throw faceError("invalid_request");
        return { pong: true };
      },
    },
    {
      operation: programmeOperations.contextRead,
      async resolve(payload, { session }) {
        if (!emptyPayload(payload)) throw faceError("invalid_request");
        session.assertLive();
        const { application, selection } = session;
        return {
          application: {
            id: application.id,
            version: application.version,
            publisher: application.publisher,
          },
          programme: {
            id: application.programme.id,
            name: application.programme.name,
          },
          selected: selection
            ? { context_id: selection.contextId, object_id: selection.objectId }
            : null,
          signed_in: true,
        };
      },
    },
    {
      operation: programmeOperations.taskUpdate,
      async resolve(payload, { session, handlers }) {
        if (
          !isRecord(payload) ||
          !exactKeys(payload, ["path", "title"]) ||
          !isTaskPath(payload.path) ||
          (payload.title !== undefined &&
            (typeof payload.title !== "string" || !TITLE.test(payload.title)))
        ) {
          throw faceError("invalid_request");
        }
        session.assertLive();
        // A path segment naming a product is a hint only; selection still
        // goes through programme.product.select.
        const mode = payload.path === session.task ? "replace" : "push";
        session.task = payload.path;
        handlers.navigate(payload.path, mode);
        return { path: payload.path };
      },
    },
  ];
}
