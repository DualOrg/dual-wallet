import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import type { LoginOut } from "@/api/web-sdk/models/LoginOut";
import { SESSION_COOKIE_NAME } from "@/api/settings";
import type { TenantContext } from "@/api/tenant";
import { tenantFromRequest } from "@/api/tenant";
import { ResponseError } from "@/api/web-sdk/runtime";
import { getWalletsApi } from "@/api/web-sdk-client";
import { toViewerWallet } from "@/app/_adapters/wallet";
import type { AuthenticationMethod } from "@/app/_domain/session";
import type { ViewerWallet } from "@/app/_domain/wallet";

const isProduction = process.env.NODE_ENV === "production";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_MARGIN_MS = 30_000;

// The session lives entirely in the cookie. Holding it in process memory loses
// every signed-in wallet whenever the container is replaced or a request lands
// on a second instance, which on a scale-to-zero platform is routine.
interface SessionState {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  organizationId: string;
  host: string;
  authenticationMethod: AuthenticationMethod;
}

export type SessionResult =
  | { status: "active"; state: SessionState; rotated: boolean }
  | { status: "expired" }
  | { status: "unavailable"; state: SessionState };

let cachedKey: Buffer | undefined;

// ponytail: SESSION_SECRET is optional for now. Unset or unusable, the key is
// derived from a constant in this file — obfuscation, not a secret, since anyone
// with the source can reproduce it. The sealed cookie format does not change, so
// restoring a real key is this function and nothing else.
//
// What is given up until then is tamper-evidence, not confidentiality: the GCM
// tag no longer proves the client did not author its own cookie, and
// organizationId, host and accessExpiresAt are the fields that depend on it.
// They decide tenant binding in readSession and refresh timing in
// activeSession, and neither is a JWT claim the backend re-checks.
//
// It throws on neither branch on purpose. Throwing here surfaced a missing
// variable as a 502 on every sign-in, with nothing in the logs and the message
// echoed to the browser; a deployment that is merely less protected should not
// look like one that is broken.
function sessionKey() {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET;
  const supplied = secret ? Buffer.from(secret, "base64") : undefined;
  if (supplied?.length === 32) {
    cachedKey = supplied;
    return cachedKey;
  }
  if (isProduction) {
    console.warn(
      secret
        ? "SESSION_SECRET is not 32 bytes of base64 (openssl rand -base64 32); sealing sessions with the derived fallback key."
        : "SESSION_SECRET is unset; sealing sessions with the derived fallback key.",
    );
  }
  // Stable across dev restarts so local sign-ins survive a recompile.
  cachedKey = createHash("sha256").update("smarttoken-viewer-dev").digest();
  return cachedKey;
}

function seal(state: SessionState) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sessionKey(), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(state), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

function unseal(value: string): SessionState | undefined {
  try {
    const raw = Buffer.from(value, "base64url");
    if (raw.length <= 28) return undefined;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      sessionKey(),
      raw.subarray(0, 12),
    );
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([
      decipher.update(raw.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(json) as SessionState;
  } catch {
    // Tampered, truncated, or sealed with a retired key.
    return undefined;
  }
}

function jwtExpiry(token: string, fallbackMs: number) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return Date.now() + fallbackMs;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(
      Buffer.from(normalized, "base64").toString("utf8"),
    ) as { exp?: unknown };
    return typeof parsed.exp === "number"
      ? parsed.exp * 1000
      : Date.now() + fallbackMs;
  } catch {
    return Date.now() + fallbackMs;
  }
}

function isAuthRejection(error: unknown) {
  return (
    error instanceof ResponseError &&
    (error.response.status === 401 || error.response.status === 403)
  );
}

export function writeSession(response: NextResponse, state: SessionState) {
  response.cookies.set(SESSION_COOKIE_NAME, seal(state), {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: THIRTY_DAYS_MS / 1000,
  });
}

// revokeSession ends the session on the API so the refresh token sealed in the
// cookie stops working. Dropping the cookie alone leaves that token usable for
// its full thirty days — most of a month of sign-in for anyone holding a copy.
//
// It never throws. A failed revoke must not stop the sign-out: the cookie still
// goes, and the token still expires on its own.
export async function revokeSession(request: NextRequest): Promise<void> {
  const state = readSession(request);
  if (!state) return;
  try {
    await getWalletsApi(state.refreshToken).logout({ cache: "no-store" });
  } catch {
    // Already revoked, already expired, or the API is unreachable — every one
    // of them ends the same way here.
  }
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
  });
}

export function establishSession(
  response: NextResponse,
  login: LoginOut,
  tenant: TenantContext,
  authenticationMethod: AuthenticationMethod,
) {
  try {
    const payload = login.accessToken.split(".")[1];
    if (!payload) return false;
    const decoded = JSON.parse(
      Buffer.from(
        payload.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8"),
    ) as { org_id?: unknown };
    if (decoded.org_id !== tenant.organizationId) return false;
  } catch {
    return false;
  }
  writeSession(response, {
    accessToken: login.accessToken,
    refreshToken: login.refreshToken,
    accessExpiresAt: jwtExpiry(login.accessToken, 4 * 60 * 1000),
    organizationId: tenant.organizationId,
    host: tenant.host,
    authenticationMethod,
  });
  return true;
}

export function readSession(request: NextRequest): SessionState | undefined {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const tenant = tenantFromRequest(request);
  if (!cookie || !tenant) return undefined;
  const state = unseal(cookie);
  if (
    !state ||
    state.host !== tenant.host ||
    state.organizationId !== tenant.organizationId
  ) {
    return undefined;
  }
  return state;
}

// ponytail: no cross-request single-flight. Each request renews its own copy;
// if the API ever starts invalidating rotated refresh tokens, parallel requests
// will need the renewal narrowed to /api/session alone.
export async function activeSession(
  request: NextRequest,
  force = false,
): Promise<SessionResult | undefined> {
  const state = readSession(request);
  if (!state) return undefined;
  if (!force && state.accessExpiresAt > Date.now() + REFRESH_MARGIN_MS) {
    return { status: "active", state, rotated: false };
  }
  try {
    const result = await getWalletsApi(state.refreshToken).refreshToken({
      cache: "no-store",
    });
    return {
      status: "active",
      rotated: true,
      state: {
        ...state,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken || state.refreshToken,
        accessExpiresAt: jwtExpiry(result.accessToken, 4 * 60 * 1000),
      },
    };
  } catch (error) {
    // Only a rejected refresh token ends the session. A timeout or a 500
    // upstream must not sign the wallet out.
    return isAuthRejection(error)
      ? { status: "expired" }
      : { status: "unavailable", state };
  }
}

export async function currentWallet(
  request: NextRequest,
): Promise<
  | { status: "active"; wallet: ViewerWallet; state: SessionState }
  | { status: "expired" }
  | { status: "unavailable" }
> {
  const session = await activeSession(request);
  if (!session) return { status: "expired" };
  if (session.status !== "active") {
    return session.status === "expired"
      ? { status: "expired" }
      : { status: "unavailable" };
  }
  try {
    const wallet = await getWalletsApi(session.state.accessToken).getWallet({
      cache: "no-store",
    });
    return {
      status: "active",
      wallet: toViewerWallet(wallet),
      state: session.state,
    };
  } catch (error) {
    if (isAuthRejection(error)) return { status: "expired" };
    return { status: "unavailable" };
  }
}

export function upstreamUrl(path: string, search = "") {
  const base = process.env.API_URL || "https://api.dual.network";
  const url = new URL(path.replace(/^\/+/, ""), `${base.replace(/\/+$/, "")}/`);
  url.search = search;
  return url;
}

export function copyUpstreamHeaders(upstream: Response) {
  const headers = new Headers();
  for (const name of [
    "content-type",
    "etag",
    "last-modified",
    "x-request-id",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export async function authenticatedUpstreamFetch(
  request: NextRequest,
  url: URL,
  init: RequestInit,
): Promise<{ response: Response; state?: SessionState; expired: boolean }> {
  const requestWithToken = (token: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return { ...init, headers };
  };

  const session = await activeSession(request);
  if (!session || session.status === "expired") {
    return { response: new Response(null, { status: 401 }), expired: true };
  }
  if (session.status === "unavailable") {
    return {
      response: new Response(null, { status: 503 }),
      state: session.state,
      expired: false,
    };
  }

  let state = session.state;
  let response = await fetch(url, requestWithToken(state.accessToken));
  if (response.status === 401) {
    const retry = await activeSession(request, true);
    if (!retry || retry.status !== "active") {
      return {
        response,
        state: retry?.status === "unavailable" ? retry.state : undefined,
        expired: retry?.status !== "unavailable",
      };
    }
    state = retry.state;
    response = await fetch(url, requestWithToken(state.accessToken));
  }
  return { response, state, expired: false };
}
