import type { NextRequest } from "next/server";
import { readJsonRecord } from "@/api/request";
import { authorizeAssertion } from "@/api/product-face-operations";
import {
  faceContextError,
  faceResponse,
  resolveFaceRequest,
} from "@/api/product-face-server";

type Params = { params: Promise<{ slug: string }> };

// Mints one wallet assertion for one exact runtime request. Only the wallet's
// own same-origin code can call this: the cookie is SameSite=Strict and the
// mutation origin is checked.
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const context = await resolveFaceRequest(request, slug, { mutation: true });
  if (!("binding" in context)) return context;
  const body = await readJsonRecord(request);
  if (!body) return faceContextError(context, "invalid_request", 400);
  try {
    const result = await authorizeAssertion(context, request, body);
    if (!result.ok) {
      return faceResponse(
        context,
        { code: result.code },
        { status: result.status, journal: result.journal },
      );
    }
    return faceResponse(
      context,
      {
        operation_id: result.operationId,
        assertion: result.assertion,
        expires_at: new Date(result.expiresAt).toISOString(),
      },
      { journal: result.journal },
    );
  } catch {
    return faceContextError(context, "upstream_unavailable", 502);
  }
}
