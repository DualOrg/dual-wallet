import {
  externalFaceApplicationMatches,
  externalFaceBridgeApplication,
} from "@/app/_lib/external-face-bridge/core/application";
import {
  externalFaceCapabilities,
  resolveExternalFaceBridgeRequest,
  type ExternalFaceBridgeHandlers,
} from "@/app/_lib/external-face-bridge/capabilities";
import { objectOperations } from "@/app/_lib/external-face-bridge/capabilities/object";
import { openBridgeChannel } from "@/app/_lib/external-face-bridge/core/channel";
import type { AuthenticatedExternalFaceContext } from "@/app/_lib/external-face-bridge/core/context";

export interface ExternalFaceBridgeHost {
  close(): void;
  updateContext(context: AuthenticatedExternalFaceContext): void;
}

export function startAuthenticatedExternalFaceBridge({
  frame,
  displayUrl,
  context: initialContext,
  handlers = {},
}: {
  frame: HTMLIFrameElement;
  displayUrl: string;
  context: AuthenticatedExternalFaceContext;
  handlers?: ExternalFaceBridgeHandlers;
}): ExternalFaceBridgeHost | undefined {
  const application = externalFaceBridgeApplication(displayUrl);
  const targetOrigin = application?.origin;
  const child = frame.contentWindow;
  if (!application || !targetOrigin || !child) return undefined;

  let context = initialContext;
  let subscribed = false;

  const operationNames = () =>
    externalFaceCapabilities(handlers, context.variant).map(
      ({ operation }) => operation,
    );

  const channel = openBridgeChannel({
    child,
    targetOrigin,
    verifyReady: (ready) => externalFaceApplicationMatches(application, ready),
    initializationContext: () => ({
      object_id: context.object.id,
      variant: context.variant,
      public: false,
      locale: document.documentElement.lang || "en",
      theme: document.documentElement.dataset.theme || "light",
      object: context.object,
      config: context.config,
      actions: context.actions.map((name) => ({ name })),
      capabilities: operationNames(),
    }),
    resolve: (request) =>
      resolveExternalFaceBridgeRequest(request, context, handlers),
    onSuccess: (request) => {
      if (request.operation === objectOperations.subscribe) subscribed = true;
      if (request.operation === objectOperations.unsubscribe) {
        subscribed = false;
      }
    },
  });
  if (!channel) return undefined;

  return {
    close: channel.close,
    updateContext(next) {
      const previousHash = context.revision.contentHash;
      const previousStateHash = context.revision.stateHash;
      context = next;
      if (
        !channel.closed &&
        channel.initialized &&
        subscribed &&
        (previousHash !== next.revision.contentHash ||
          previousStateHash !== next.revision.stateHash)
      ) {
        channel.postEvent("object.changed", {
          object_id: next.object.id,
          content_hash: next.revision.contentHash,
          change: ["object", "attributes"],
        });
      }
    },
  };
}
