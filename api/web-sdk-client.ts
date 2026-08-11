import { EbusApi, ObjectsApi, WalletsApi } from "@/api/web-sdk/apis";
import { BASE_PATH, Configuration, ResponseError } from "@/api/web-sdk/runtime";

function basePath() {
  if (typeof window !== "undefined") return "/api/backend";
  return (process.env.API_URL || BASE_PATH).replace(/\/+$/, "");
}

function configuration(accessToken?: string) {
  return new Configuration({
    basePath: basePath(),
    accessToken: accessToken ? () => accessToken : undefined,
    credentials: "same-origin",
  });
}

export const getWalletsApi = (accessToken?: string) =>
  new WalletsApi(configuration(accessToken));

export const getObjectsApi = (accessToken?: string) =>
  new ObjectsApi(configuration(accessToken));

export const getEbusApi = (accessToken?: string) =>
  new EbusApi(configuration(accessToken));

export interface NormalizedApiError {
  message: string;
  status: number;
  requestId?: string;
  code?: string | number;
}

export async function normalizeApiError(
  error: unknown,
  fallback = "The smart object service is temporarily unavailable.",
): Promise<NormalizedApiError> {
  if (error instanceof ResponseError) {
    const requestId = error.response.headers.get("x-request-id") ?? undefined;
    let message = fallback;
    let code: string | number | undefined;
    try {
      const body = (await error.response.clone().json()) as {
        message?: unknown;
        code?: unknown;
      };
      if (typeof body.message === "string" && body.message)
        message = body.message;
      if (typeof body.code === "string" || typeof body.code === "number") {
        code = body.code;
      }
    } catch {
      // Keep the safe fallback for non-JSON upstream failures.
    }
    return { message, status: error.response.status, requestId, code };
  }
  if (error instanceof Error && error.message) {
    return { message: error.message, status: 502 };
  }
  return { message: fallback, status: 502 };
}
