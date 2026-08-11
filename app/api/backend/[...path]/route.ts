import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { validateProxyPath } from "@/api/proxy-policy";
import { validRequestOrigin } from "@/api/request";
import {
  authenticatedUpstreamFetch,
  clearSessionCookie,
  copyUpstreamHeaders,
  terminateSession,
  upstreamUrl,
} from "@/api/server-session";
import { MAX_BFF_BODY_BYTES } from "@/api/settings";

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const decision = validateProxyPath(request.method, path);
  if (!decision.allowed) {
    return NextResponse.json(
      { message: decision.message },
      { status: decision.status },
    );
  }
  if (request.method !== "GET" && !validRequestOrigin(request)) {
    return NextResponse.json(
      { message: "Invalid request origin." },
      { status: 403 },
    );
  }

  const headers = new Headers({ Accept: "application/json" });
  const contentType = request.headers.get("content-type");
  const acceptLanguage = request.headers.get("accept-language");
  if (contentType) headers.set("Content-Type", contentType);
  if (acceptLanguage) headers.set("Accept-Language", acceptLanguage);

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET") {
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_BFF_BODY_BYTES) {
      return NextResponse.json(
        { message: "Request body too large." },
        { status: 413 },
      );
    }
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BFF_BODY_BYTES) {
      return NextResponse.json(
        { message: "Request body too large." },
        { status: 413 },
      );
    }
  }

  try {
    const upstream = await authenticatedUpstreamFetch(
      request,
      upstreamUrl(path.join("/"), request.nextUrl.search),
      {
        method: request.method,
        headers,
        body,
        cache: "no-store",
        redirect: "manual",
      },
    );
    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: copyUpstreamHeaders(upstream),
    });
    response.headers.set("Cache-Control", "private, no-store");
    if (upstream.status === 401) clearSessionCookie(response);
    if (
      request.method === "DELETE" &&
      upstream.ok &&
      path[0] === "wallets" &&
      path[1] === "me"
    ) {
      terminateSession(request);
      clearSessionCookie(response);
    }
    return response;
  } catch {
    return NextResponse.json(
      { message: "The smart object service is temporarily unavailable." },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
