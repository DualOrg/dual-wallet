import "client-only";

import { normalizeApiError } from "@/api/web-sdk-client";
import { ViewerError, type ViewerErrorCategory } from "@/app/_domain/errors";

function category(status: number): ViewerErrorCategory {
  if (status === 401) return "authentication";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 400 || status === 409 || status === 422) return "validation";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream";
  return "unknown";
}

export async function toViewerError(error: unknown, fallback: string) {
  if (error instanceof ViewerError) return error;
  const normalized = await normalizeApiError(error, fallback);
  return new ViewerError(
    normalized.message,
    category(normalized.status),
    normalized.status === 408 ||
      normalized.status === 429 ||
      normalized.status >= 500,
    normalized.status,
    normalized.requestId,
  );
}
