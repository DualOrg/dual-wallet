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
  type BridgeRequest,
} from "@/app/_lib/external-face-bridge/core/protocol";

export interface BridgeChannel {
  close(): void;
  readonly closed: boolean;
  readonly initialized: boolean;
  postEvent(event: string, payload: object): void;
}

/**
 * One private MessageChannel to one exact frame origin. The child receives
 * port2 with the bootstrap only if the frame is at `targetOrigin`; afterwards
 * every message travels over the port, never `window`. Context is sent only
 * after the ready identity verifies; a mismatch closes the channel.
 */
export function openBridgeChannel({
  child,
  targetOrigin,
  verifyReady,
  initializationContext,
  resolve,
  onSuccess,
  onInitialized,
  onClose,
}: {
  child: Window;
  targetOrigin: string;
  verifyReady: (application: Record<string, unknown>) => boolean;
  initializationContext: () => object;
  resolve: (request: BridgeRequest) => Promise<unknown>;
  onSuccess?: (request: BridgeRequest) => void;
  onInitialized?: () => void;
  onClose?: () => void;
}): BridgeChannel | undefined {
  if (typeof MessageChannel === "undefined") return undefined;
  const channel = new MessageChannel();
  const channelId = crypto.randomUUID();
  let initialized = false;
  let closed = false;
  const requestIds = new Set<string>();
  let requestTimes: number[] = [];
  const readyTimer = window.setTimeout(
    () => close(),
    bridgeLimits.readyTimeoutMs,
  );

  const post = (message: object) => {
    if (!closed) channel.port1.postMessage(message);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    window.clearTimeout(readyTimer);
    channel.port1.close();
    onClose?.();
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
      if (!verifyReady(message.application)) {
        close();
        return;
      }
      window.clearTimeout(readyTimer);
      post({
        type: bridgeMessageTypes.initialize,
        protocol: BRIDGE_PROTOCOL,
        version: BRIDGE_VERSION,
        channel_id: channelId,
        context: initializationContext(),
      });
      initialized = true;
      onInitialized?.();
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
        post(
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
        post(
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
      post(
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
      post(
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

    void resolve(message)
      .then((result) => {
        if (safeMessageSize(result) > bridgeLimits.maxResponseBytes) {
          throw new ExternalFaceBridgeError(
            "response_too_large",
            "The requested data is too large for the bridge.",
          );
        }
        onSuccess?.(message);
        post({
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
        post(
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
    get closed() {
      return closed;
    },
    get initialized() {
      return initialized;
    },
    postEvent(event, payload) {
      if (!initialized) return;
      post({
        type: bridgeMessageTypes.event,
        protocol: BRIDGE_PROTOCOL,
        version: BRIDGE_VERSION,
        event,
        payload,
      });
    },
  };
}
