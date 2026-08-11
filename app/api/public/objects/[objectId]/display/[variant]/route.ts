import {
  MAX_PUBLIC_DISPLAY_BYTES,
  publicDisplayUpstreamPath,
} from "@/api/public-display";
import { upstreamUrl } from "@/api/server-session";

const ALLOWED_MEDIA_TYPES = new Set(["text/html", "image/svg+xml"]);

export async function GET(
  request: Request,
  context: {
    params: Promise<{ objectId: string; variant: string }>;
  },
) {
  const { objectId, variant } = await context.params;
  const path = publicDisplayUpstreamPath(objectId, variant);
  if (!path) return new Response(null, { status: 404 });

  const headers = new Headers({ Accept: "text/html, image/svg+xml" });
  const etag = request.headers.get("if-none-match");
  if (etag) headers.set("If-None-Match", etag);

  try {
    const upstream = await fetch(upstreamUrl(path), {
      method: "GET",
      headers,
      cache: "no-store",
      redirect: "manual",
    });
    if (upstream.status === 304) {
      return new Response(null, {
        status: 304,
        headers: etag ? { ETag: etag } : undefined,
      });
    }
    if (!upstream.ok) {
      return new Response(null, {
        status: upstream.status === 404 ? 404 : 502,
      });
    }

    const contentType =
      upstream.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "";
    if (!ALLOWED_MEDIA_TYPES.has(contentType)) {
      return new Response(null, { status: 502 });
    }
    const declaredSize = Number(upstream.headers.get("content-length") ?? "0");
    if (
      Number.isFinite(declaredSize) &&
      declaredSize > MAX_PUBLIC_DISPLAY_BYTES
    ) {
      return new Response(null, { status: 502 });
    }

    const body = await upstream.arrayBuffer();
    if (body.byteLength > MAX_PUBLIC_DISPLAY_BYTES) {
      return new Response(null, { status: 502 });
    }

    const responseHeaders = new Headers({
      "Cache-Control": "public, no-cache",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Object-Display-Type": contentType,
    });
    for (const name of ["etag", "last-modified", "x-request-id"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(body, { status: 200, headers: responseHeaders });
  } catch {
    return new Response(null, { status: 502 });
  }
}
