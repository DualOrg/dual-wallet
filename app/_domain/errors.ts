export type ViewerErrorCategory =
  | "authentication"
  | "forbidden"
  | "not_found"
  | "validation"
  | "rate_limited"
  | "upstream"
  | "unknown";

export class ViewerError extends Error {
  constructor(
    message: string,
    public readonly category: ViewerErrorCategory,
    public readonly retryable: boolean,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ViewerError";
  }
}
