import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MAX_BFF_BODY_BYTES } from "@/api/settings";

/**
 * A branded host without the transfer journey offers no native transfer
 * either (Root's decision): the wallet's own Dual `transfer` action through
 * the /api/backend proxy is refused here, in the request proxy, before the
 * backend route runs, so nothing is prepared, executed or sent to Dual.
 * The generic wallet and hosts with transfer enabled never reach this.
 */

/** The path as routing sees it: percent-decoded, repeated slashes folded. */
export function routedPath(raw: string) {
  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {
    // Not decodable: routing cannot decode it either.
  }
  return path.replace(/[\\/]+/g, "/");
}

const BACKEND = /^\/api\/backend(?:\/|$)/i;

/** A request to the generic backend proxy that may carry an action body. */
export function isBackendWrite(request: NextRequest) {
  return (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    BACKEND.test(routedPath(request.nextUrl.pathname))
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Field names are compared the way a case-insensitive JSON decoder could
// match them (Go's encoding/json folds case, "ſ" included), so no spelling
// of `action` or `transfer` slips past.
const named = (key: string, name: string) => key.toUpperCase() === name;

/** Whether a prepare or execute body names Dual's `transfer` action. */
export function namesNativeTransfer(body: unknown) {
  if (!record(body)) return false;
  return Object.entries(body).some(
    ([key, action]) =>
      named(key, "ACTION") &&
      record(action) &&
      Object.entries(action).some(
        ([name, value]) =>
          named(name, "TRANSFER") && value !== null && value !== undefined,
      ),
  );
}

const refusal = () =>
  NextResponse.json(
    {
      code: "capability_not_granted",
      message: "Transfers are not available in this wallet.",
    },
    { status: 403, headers: { "Cache-Control": "private, no-store" } },
  );

/**
 * The refusal for a backend write that names a native transfer, or that
 * cannot be read as JSON (fails closed: no wallet request sends anything
 * else to the backend proxy); undefined when the request may continue.
 */
export async function nativeTransferRefusal(request: NextRequest) {
  let text: string;
  try {
    text = await request.clone().text();
  } catch {
    return refusal();
  }
  if (!text) return undefined;
  if (Buffer.byteLength(text, "utf8") > MAX_BFF_BODY_BYTES) return refusal();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return refusal();
  }
  return namesNativeTransfer(parsed) ? refusal() : undefined;
}
