import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MAX_BFF_BODY_BYTES } from "@/api/settings";
import { custodyActions } from "@/app/_domain/wallet-host";

/**
 * A branded host without the transfer journey offers no native transfer
 * either (Root's decision): no Dual action that moves custody (transfer, drop,
 * pickup, claim_ownership, or a permit delegating one) passes the
 * /api/backend proxy. It is refused here, in the request proxy, before the
 * backend route runs, so nothing is prepared, executed or sent to Dual.
 *
 * The route forwards the request's raw bytes, so the body is checked exactly
 * as every decoder will read it: valid UTF-8, one top-level JSON object, and
 * no member name repeated at any depth, however it is spelled (escaped,
 * case-folded, with or without underscores). A body that could be read two
 * ways, or that is not a single object, is refused before anything is sent.
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

// Member names are compared the way a case-insensitive JSON decoder could
// match them (Go's encoding/json folds case: "ſ" is S, the Kelvin sign K),
// and without underscores (claim_ownership, claimOwnership), so no spelling
// of a name slips past or stands in for another.
const fold = (name: string) =>
  name.toLowerCase().toUpperCase().replace(/_/g, "");

/**
 * Whether valid JSON text repeats a member name (folded) in any one object,
 * at any depth. Keys are compared decoded, so an escaped spelling is the same
 * name. Only meaningful for text JSON.parse accepts.
 */
export function repeatsMemberName(text: string) {
  const frames: Array<{ names: Set<string>; expectName: boolean } | null> = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      let end = index + 1;
      while (end < text.length && text[end] !== '"') {
        end += text[end] === "\\" ? 2 : 1;
      }
      const frame = frames[frames.length - 1];
      if (frame?.expectName) {
        let name: unknown;
        try {
          name = JSON.parse(text.slice(index, end + 1));
        } catch {
          return true;
        }
        const folded = fold(String(name));
        if (frame.names.has(folded)) return true;
        frame.names.add(folded);
        frame.expectName = false;
      }
      index = end;
    } else if (char === "{") {
      frames.push({ names: new Set(), expectName: true });
    } else if (char === "[") {
      frames.push(null);
    } else if (char === "}" || char === "]") {
      frames.pop();
    } else if (char === ",") {
      const frame = frames[frames.length - 1];
      if (frame) frame.expectName = true;
    }
  }
  return false;
}

/** The one JSON object these bytes are, read unambiguously; else undefined. */
export function unambiguousObject(bytes: ArrayBuffer) {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!record(parsed) || repeatsMemberName(text)) return undefined;
  return parsed;
}

const CUSTODY = new Set<string>(custodyActions.map(fold));
// Dual's action kinds (ActionsRequest): an action sets exactly one of them.
const KINDS = new Set(
  [
    "mint",
    "transfer",
    "drop",
    "pickup",
    "redeem",
    "burn",
    "update",
    "claim_ownership",
    "connect",
    "disconnect",
    "remote",
    "permit",
    "set_attributes",
    "delete_attributes",
  ].map(fold),
);
// What an action may carry beside its one kind.
const ACTION_EXTRAS = new Set(["alias", "permit_secret"].map(fold));

/**
 * Whether a body sent through the backend proxy could move custody, or names
 * an action it cannot be decided on. Its `action` (any spelling) must name
 * exactly one known kind, as an object, that is not a custody action; a
 * permit may delegate only a known kind that is not one either.
 */
export function movesCustody(body: Record<string, unknown>) {
  return Object.entries(body).some(([key, action]) => {
    if (fold(key) !== fold("action")) return false;
    if (!record(action)) return true;
    const members = Object.entries(action);
    if (
      members.some(
        ([name]) => !KINDS.has(fold(name)) && !ACTION_EXTRAS.has(fold(name)),
      )
    )
      return true;
    const kinds = members.filter(([name]) => KINDS.has(fold(name)));
    if (kinds.length !== 1) return true;
    const [[name, details]] = kinds;
    if (!record(details) || CUSTODY.has(fold(name))) return true;
    if (fold(name) !== fold("permit")) return false;
    const scopes = Object.entries(details).filter(
      ([field]) => fold(field) === fold("scope"),
    );
    if (scopes.length !== 1 || typeof scopes[0][1] !== "string") return true;
    const scope = fold(scopes[0][1].trim());
    return !KINDS.has(scope) || CUSTODY.has(scope);
  });
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
 * The refusal for a backend write on a host without the transfer journey that
 * could move custody, or whose body is not one unambiguous JSON object (fails
 * closed: no wallet request sends anything else to the backend proxy);
 * undefined when the request may continue unchanged.
 */
export async function nativeTransferRefusal(request: NextRequest) {
  let bytes: ArrayBuffer;
  try {
    bytes = await request.clone().arrayBuffer();
  } catch {
    return refusal();
  }
  if (!bytes.byteLength) return undefined;
  if (bytes.byteLength > MAX_BFF_BODY_BYTES) return refusal();
  const body = unambiguousObject(bytes);
  return !body || movesCustody(body) ? refusal() : undefined;
}
