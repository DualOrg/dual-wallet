import type {
  ProductFaceApplication,
  RegistrationStatus,
  SessionEndReason,
} from "@/app/_domain/product-face";
import {
  productFaceOperationNames,
  resolveProductFaceRequest,
} from "@/app/_lib/external-face-bridge/capabilities/product-face";
import type { ProductFaceRuntime } from "@/app/_lib/external-face-bridge/capabilities/product-types";
import {
  productFaceApplicationMatches,
  productFaceFrameMatches,
} from "@/app/_lib/external-face-bridge/core/application";
import { openBridgeChannel } from "@/app/_lib/external-face-bridge/core/channel";
import { productFaceInitializeContext } from "@/app/_lib/external-face-bridge/core/product-context";
import {
  ProductFaceSession,
  type ProductFaceHandlers,
} from "@/app/_lib/external-face-bridge/core/product-session";

export interface ProductFaceBridgeHost {
  readonly session: ProductFaceSession;
  /** Sends session.ended first, then closes the channel for good. */
  end(reason: SessionEndReason): void;
  close(): void;
  restoreTask(path: string): void;
  operationUpdated(operationId: string, status: RegistrationStatus): void;
}

/**
 * Starts the application-variant bridge for a server-resolved product
 * binding. The frame must be at the exact bound origin under the pinned path,
 * and the ready identity must equal the binding exactly; otherwise nothing
 * is sent and the channel closes.
 */
export function startProductFaceBridge({
  frame,
  frameUrl,
  application,
  holder,
  task,
  handlers,
  onInitialized,
}: {
  frame: HTMLIFrameElement;
  frameUrl: string;
  application: ProductFaceApplication;
  holder: string;
  task: string;
  handlers: ProductFaceHandlers;
  onInitialized?: (host: ProductFaceBridgeHost) => void;
}): ProductFaceBridgeHost | undefined {
  const child = frame.contentWindow;
  if (!child || !productFaceFrameMatches(application, frameUrl) || !holder) {
    return undefined;
  }
  const session = new ProductFaceSession(application, holder, task);
  // A context change caused by a request is announced after that request's
  // response, so the face never sees the event before the context it names.
  const queuedEvents: Array<{ event: string; payload: object }> = [];
  const runtime: ProductFaceRuntime = {
    session,
    handlers,
    events: {
      contextChanged(contextId, reason) {
        queuedEvents.push({
          event: "programme.context.changed",
          payload: { context_id: contextId, reason },
        });
      },
    },
  };
  const channel = openBridgeChannel({
    child,
    targetOrigin: application.origin,
    verifyReady: (ready) => productFaceApplicationMatches(application, ready),
    initializationContext: () =>
      productFaceInitializeContext(
        application,
        session.task,
        productFaceOperationNames(),
      ),
    resolve: (request) => resolveProductFaceRequest(request, runtime),
    onResponded: () => {
      for (const queued of queuedEvents.splice(0)) {
        channel?.postEvent(queued.event, queued.payload);
      }
    },
    onInitialized: () => onInitialized?.(host),
    onClose: () => {
      session.selection = null;
      session.ended ??= "expired";
    },
  });
  if (!channel) return undefined;

  const host: ProductFaceBridgeHost = {
    session,
    end(reason) {
      if (channel.closed) return;
      session.ended = reason;
      session.selection = null;
      session.generation += 1;
      channel.postEvent("session.ended", { reason });
      channel.close();
    },
    close() {
      channel.close();
    },
    restoreTask(path) {
      if (session.ended) return;
      session.task = path;
      channel.postEvent("navigation.task.restore", { path });
    },
    operationUpdated(operationId, status) {
      if (session.ended) return;
      channel.postEvent("operation.updated", {
        operation_id: operationId,
        status,
      });
    },
  };
  return host;
}
