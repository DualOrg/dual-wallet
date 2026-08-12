export class ExternalFaceBridgeError extends Error {
  constructor(
    public code: string,
    public safeMessage: string,
    public retryable = false,
  ) {
    super(code);
    this.name = "ExternalFaceBridgeError";
  }
}

export function bridgeFailure(error: unknown) {
  if (error instanceof ExternalFaceBridgeError) return error;
  if (error instanceof Error && error.message === "capability_denied") {
    return new ExternalFaceBridgeError(
      "capability_denied",
      "The operation is not available in this Viewer context.",
    );
  }
  return new ExternalFaceBridgeError(
    "temporarily_unavailable",
    "The Viewer could not complete this request.",
    true,
  );
}
