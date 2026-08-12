export const BRIDGE_PROTOCOL = "dual.face.bridge";
export const BRIDGE_VERSION = 1;

export const bridgeLimits = {
  maxRequestBytes: 64 * 1024,
  maxResponseBytes: 512 * 1024,
  readyTimeoutMs: 5_000,
  requestsPerMinute: 30,
  maxRequestIds: 2_048,
} as const;

export const bridgeMessageTypes = {
  bootstrap: "dual.face.bootstrap",
  ready: "dual.face.ready",
  initialize: "dual.face.initialize",
  request: "dual.face.request",
  response: "dual.face.response",
  event: "dual.face.event",
} as const;

export interface BridgeRequest {
  type: typeof bridgeMessageTypes.request;
  protocol: typeof BRIDGE_PROTOCOL;
  version: typeof BRIDGE_VERSION;
  request_id: string;
  operation: string;
  payload: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function emptyPayload(value: unknown) {
  return isRecord(value) && Object.keys(value).length === 0;
}

export function validBridgeRequest(value: unknown): value is BridgeRequest {
  return (
    isRecord(value) &&
    exactKeys(value, [
      "type",
      "protocol",
      "version",
      "request_id",
      "operation",
      "payload",
    ]) &&
    value.type === bridgeMessageTypes.request &&
    value.protocol === BRIDGE_PROTOCOL &&
    value.version === BRIDGE_VERSION &&
    typeof value.request_id === "string" &&
    value.request_id.length > 0 &&
    value.request_id.length <= 256 &&
    typeof value.operation === "string"
  );
}

export function safeMessageSize(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function bridgeErrorResponse(
  requestId: string,
  code: string,
  message: string,
  retryable = false,
) {
  return {
    type: bridgeMessageTypes.response,
    protocol: BRIDGE_PROTOCOL,
    version: BRIDGE_VERSION,
    request_id: requestId,
    ok: false,
    error: { code, message, retryable },
  };
}
