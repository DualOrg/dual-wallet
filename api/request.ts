import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MAX_BFF_BODY_BYTES } from "@/api/settings";
import { normalizeApiError } from "@/api/web-sdk-client";
import { utf8ByteLength } from "@/app/_domain/password";

export function validRequestOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    const originUrl = new URL(origin);
    const forwardedHost = request.headers.get("x-forwarded-host");
    const requestHost = (forwardedHost || request.headers.get("host") || "")
      .split(",", 1)[0]
      .trim()
      .toLowerCase();
    return originUrl.host.toLowerCase() === requestHost;
  } catch {
    return false;
  }
}

export async function readJsonRecord(request: NextRequest) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BFF_BODY_BYTES) {
    return undefined;
  }
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BFF_BODY_BYTES) return undefined;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function requiredString(
  body: Record<string, unknown>,
  name: string,
  maxLength = 512,
) {
  const value = body[name];
  return typeof value === "string" && value.trim() && value.length <= maxLength
    ? value.trim()
    : undefined;
}

export function optionalString(
  body: Record<string, unknown>,
  name: string,
  maxLength = 512,
) {
  const value = body[name];
  if (value == null || value === "") return undefined;
  return typeof value === "string" && value.length <= maxLength
    ? value.trim()
    : undefined;
}

// Credentials are exact values. Trimming here would make a password accepted
// during registration impossible to use later when it starts or ends in a
// space.
export function optionalSecret(
  body: Record<string, unknown>,
  name: string,
  maxBytes = 512,
) {
  const value = body[name];
  if (value == null || value === "") return undefined;
  return typeof value === "string" && utf8ByteLength(value) <= maxBytes
    ? value
    : undefined;
}

export function requiredSecret(
  body: Record<string, unknown>,
  name: string,
  maxBytes = 512,
) {
  return optionalSecret(body, name, maxBytes);
}

export function optionalBoolean(body: Record<string, unknown>, name: string) {
  const value = body[name];
  return typeof value === "boolean" ? value : undefined;
}

export function mutationGuard(request: NextRequest) {
  if (validRequestOrigin(request)) return undefined;
  return NextResponse.json(
    { message: "Invalid request origin." },
    { status: 403 },
  );
}

export async function apiErrorResponse(error: unknown, fallback?: string) {
  const normalized = await normalizeApiError(error, fallback);
  return NextResponse.json(
    {
      message: normalized.message,
      requestId: normalized.requestId,
      code: normalized.code,
    },
    { status: normalized.status },
  );
}

export function tenantRequired() {
  return NextResponse.json(
    { message: "This Viewer host is not configured." },
    { status: 421 },
  );
}
