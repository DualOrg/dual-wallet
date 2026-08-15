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
import type { AuthenticatedExternalFaceContext } from "@/app/_lib/external-face-bridge/core/context";
import {
  bridgeFailure,
  ExternalFaceBridgeError,
} from "@/app/_lib/external-face-bridge/core/errors";
import {
  BRIDGE_PROTOCOL,
  BRIDGE_VERSION,
  bridgeErrorResponse,
  bridgeLimits,
  bridgeMessageTypes,
  isRecord,
  safeMessageSize,
  validBridgeRequest,
} from "@/app/_lib/external-face-bridge/core/protocol";

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
  if (
    !application ||
    !targetOrigin ||
    !child ||
    typeof MessageChannel === "undefined"
  ) {
    return undefined;
  }

  const channel = new MessageChannel();
  const channelId = crypto.randomUUID();
  let context = initialContext;
  let initialized = false;
  let subscribed = false;
  let closed = false;
  const requestIds = new Set<string>();
  let requestTimes: number[] = [];
  const readyTimer = window.setTimeout(
    () => close(),
    bridgeLimits.readyTimeoutMs,
  );

  const operationNames = () =>
    externalFaceCapabilities(handlers, context.variant).map(
      ({ operation }) => operation,
    );

  const postInitialization = () => {
    channel.port1.postMessage({
      type: bridgeMessageTypes.initialize,
      protocol: BRIDGE_PROTOCOL,
      version: BRIDGE_VERSION,
      channel_id: channelId,
      context: {
        object_id: context.object.id,
        variant: context.variant,
        public: false,
        locale: document.documentElement.lang || "en",
        theme: document.documentElement.dataset.theme || "light",
        object: context.object,
        config: context.config,
        actions: context.actions.map((name) => ({ name })),
        capabilities: operationNames(),
      },
    });
    initialized = true;
  };

  const close = () => {
    if (closed) return;
    closed = true;
    window.clearTimeout(readyTimer);
    channel.port1.close();
  };

  channel.port1.onmessage = (event: MessageEvent<unknown>) => {
    if (closed) return;
    const message = event.data;
    if (
      !initialized &&
      isRecord(message) &&
      message.type === bridgeMessageTypes.ready &&
      message.protocol === BRIDGE_PROTOCOL &&
      message.version === BRIDGE_VERSION &&
      message.channel_id === channelId &&
      isRecord(message.application)
    ) {
      if (!externalFaceApplicationMatches(application, message.application)) {
        close();
        return;
      }
      window.clearTimeout(readyTimer);
      postInitialization();
      return;
    }
    if (!initialized) return;

    const requestId =
      isRecord(message) &&
      typeof message.request_id === "string" &&
      message.request_id.length > 0 &&
      message.request_id.length <= 256
        ? message.request_id
        : undefined;
    if (safeMessageSize(message) > bridgeLimits.maxRequestBytes) {
      if (requestId) {
        channel.port1.postMessage(
          bridgeErrorResponse(
            requestId,
            "invalid_request",
            "The bridge request is too large.",
          ),
        );
      }
      return;
    }
    if (!validBridgeRequest(message)) {
      if (requestId) {
        channel.port1.postMessage(
          bridgeErrorResponse(
            requestId,
            "invalid_request",
            "The bridge request is invalid.",
          ),
        );
      }
      return;
    }

    if (requestIds.has(message.request_id)) {
      channel.port1.postMessage(
        bridgeErrorResponse(
          message.request_id,
          "invalid_request",
          "The request ID has already been used on this channel.",
        ),
      );
      return;
    }
    if (requestIds.size >= bridgeLimits.maxRequestIds) {
      close();
      return;
    }
    requestIds.add(message.request_id);

    const now = Date.now();
    requestTimes = requestTimes.filter((time) => now - time < 60_000);
    if (requestTimes.length >= bridgeLimits.requestsPerMinute) {
      channel.port1.postMessage(
        bridgeErrorResponse(
          message.request_id,
          "rate_limited",
          "This face has sent too many bridge requests.",
          true,
        ),
      );
      return;
    }
    requestTimes.push(now);

    void resolveExternalFaceBridgeRequest(message, context, handlers)
      .then((result) => {
        if (safeMessageSize(result) > bridgeLimits.maxResponseBytes) {
          throw new ExternalFaceBridgeError(
            "response_too_large",
            "The requested data is too large for the bridge.",
          );
        }
        if (message.operation === objectOperations.subscribe) subscribed = true;
        if (message.operation === objectOperations.unsubscribe)
          subscribed = false;
        channel.port1.postMessage({
          type: bridgeMessageTypes.response,
          protocol: BRIDGE_PROTOCOL,
          version: BRIDGE_VERSION,
          request_id: message.request_id,
          ok: true,
          result,
        });
      })
      .catch((error: unknown) => {
        const failure = bridgeFailure(error);
        channel.port1.postMessage(
          bridgeErrorResponse(
            message.request_id,
            failure.code,
            failure.safeMessage,
            failure.retryable,
          ),
        );
      });
  };
  channel.port1.start();
  child.postMessage(
    {
      type: bridgeMessageTypes.bootstrap,
      protocol: BRIDGE_PROTOCOL,
      version: BRIDGE_VERSION,
      channel_id: channelId,
    },
    targetOrigin,
    [channel.port2],
  );

  return {
    close,
    updateContext(next) {
      const previousHash = context.revision.contentHash;
      const previousStateHash = context.revision.stateHash;
      context = next;
      if (
        !closed &&
        initialized &&
        subscribed &&
        (previousHash !== next.revision.contentHash ||
          previousStateHash !== next.revision.stateHash)
      ) {
        channel.port1.postMessage({
          type: bridgeMessageTypes.event,
          protocol: BRIDGE_PROTOCOL,
          version: BRIDGE_VERSION,
          event: "object.changed",
          payload: {
            object_id: next.object.id,
            content_hash: next.revision.contentHash,
            change: ["object", "attributes"],
          },
        });
      }
    },
  };
}
