export class ClientApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public requestId?: string,
  ) {
    super(message);
  }
}

export async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as {
    message?: unknown;
    requestId?: unknown;
  } & T;
  if (!response.ok) {
    throw new ClientApiError(
      typeof body.message === "string" ? body.message : "Something went wrong.",
      response.status,
      typeof body.requestId === "string" ? body.requestId : undefined,
    );
  }
  return body;
}
