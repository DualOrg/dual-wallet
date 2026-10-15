import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { HostConfigurationState } from "@/api/host-configuration";
import { MAX_BFF_BODY_BYTES } from "@/api/settings";
import {
  foldMemberName as fold,
  unambiguousObject,
} from "@/api/strict-json-body";
import { custodyActions } from "@/app/_domain/wallet-host";

export { repeatsMemberName, unambiguousObject } from "@/api/strict-json-body";

/**
 * A branded host without the transfer journey offers no native transfer
 * either (Root's decision): no Dual action that moves custody (transfer, drop,
 * pickup, claim_ownership, or a permit delegating one) passes the
 * /api/backend proxy. It is refused in the request proxy, before the backend
 * route runs, and again in the backend route itself on the bytes it forwards
 * (whether or not the proxy ran for that spelling of the path), so nothing is
 * prepared, executed or sent to Dual.
 *
 * The route forwards the request's raw bytes, so the body is checked exactly
 * as every decoder will read it: valid UTF-8, one top-level JSON object, and
 * no member name repeated at any depth, however it is spelled (escaped,
 * case-folded, with or without underscores). A body that could be read two
 * ways, or that is not a single object, is refused before anything is sent.
 * The generic wallet and hosts with transfer enabled never reach this.
 */

/** Whether this host withholds native transfer: active, transfer journey off. */
export function withholdsNativeTransfer(host: HostConfigurationState) {
  return host.status === "active" && !host.configuration.journeys.transfer;
}

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
 * The refusal for a backend write body on a host without the transfer
 * journey that could move custody, or that is not one unambiguous JSON object
 * (fails closed: no wallet request sends anything else to the backend proxy);
 * undefined when the bytes may be forwarded unchanged. Decided on exactly the
 * bytes the backend route forwards.
 */
export function transferBodyRefusal(bytes: ArrayBuffer) {
  if (!bytes.byteLength) return undefined;
  if (bytes.byteLength > MAX_BFF_BODY_BYTES) return refusal();
  const body = unambiguousObject(bytes);
  return !body || movesCustody(body) ? refusal() : undefined;
}

/** The request proxy's decision on a backend write (see transferBodyRefusal). */
export async function nativeTransferRefusal(request: NextRequest) {
  let bytes: ArrayBuffer;
  try {
    bytes = await request.clone().arrayBuffer();
  } catch {
    return refusal();
  }
  return transferBodyRefusal(bytes);
}
