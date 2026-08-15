import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { LoginOut } from "@/api/web-sdk/models/LoginOut";
import type { Wallet } from "@/api/web-sdk/models/Wallet";
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

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  sessionExpiresAt: number;
  tenant: TenantContext;
  wallet: ViewerWallet;
  authenticationMethod: AuthenticationMethod;
}

interface SessionHandle {
  credential: string;
  record: StoredSession;
}

const globalSessions = globalThis as typeof globalThis & {
  __smarttokenViewerSessions?: Map<string, StoredSession>;
  __smarttokenViewerRefreshes?: Map<string, Promise<StoredSession | undefined>>;
};

const sessions =
  globalSessions.__smarttokenViewerSessions ?? new Map<string, StoredSession>();
const inflightRefreshes =
  globalSessions.__smarttokenViewerRefreshes ??
  new Map<string, Promise<StoredSession | undefined>>();

// Route handlers are bundled independently. Keep one store per Node process so
// a session created by the login route is visible to the session and proxy
// routes in the standalone runtime.
globalSessions.__smarttokenViewerSessions = sessions;
globalSessions.__smarttokenViewerRefreshes = inflightRefreshes;

function keyFor(credential: string) {
  return createHash("sha256").update(credential).digest("base64url");
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

function createRecord(
  login: LoginOut,
  tenant: TenantContext,
  authenticationMethod: AuthenticationMethod,
): StoredSession {
  return {
    accessToken: login.accessToken,
    refreshToken: login.refreshToken,
    accessExpiresAt: jwtExpiry(login.accessToken, 4 * 60 * 1000),
    sessionExpiresAt: jwtExpiry(login.refreshToken, THIRTY_DAYS_MS),
    tenant,
    wallet: toViewerWallet(login.wallet),
    authenticationMethod,
  };
}

function setCookie(response: NextResponse, credential: string) {
  response.cookies.set(SESSION_COOKIE_NAME, credential, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: THIRTY_DAYS_MS / 1000,
  });
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
  const credential = randomBytes(32).toString("base64url");
  sessions.set(
    keyFor(credential),
    createRecord(login, tenant, authenticationMethod),
  );
  setCookie(response, credential);
  return true;
}

export function terminateSession(request: NextRequest) {
  const credential = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (credential) sessions.delete(keyFor(credential));
}

export function requestSession(
  request: NextRequest,
): SessionHandle | undefined {
  const credential = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const tenant = tenantFromRequest(request);
  if (!credential || !tenant) return undefined;
  const key = keyFor(credential);
  const record = sessions.get(key);
  if (
    !record ||
    record.sessionExpiresAt <= Date.now() ||
    record.tenant.host !== tenant.host ||
    record.tenant.organizationId !== tenant.organizationId
  ) {
    sessions.delete(key);
    return undefined;
  }
  return { credential, record };
}

async function refreshSession(
  handle: SessionHandle,
  force = false,
): Promise<StoredSession | undefined> {
  if (!force && handle.record.accessExpiresAt > Date.now() + 30_000) {
    return handle.record;
  }

  const key = keyFor(handle.credential);
  const running = inflightRefreshes.get(key);
  if (running) return running;

  const refresh = (async () => {
    try {
      const result = await getWalletsApi(
        handle.record.refreshToken,
      ).refreshToken({
        cache: "no-store",
      });
      const next: StoredSession = {
        ...handle.record,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken || handle.record.refreshToken,
        accessExpiresAt: jwtExpiry(result.accessToken, 4 * 60 * 1000),
        sessionExpiresAt: result.refreshToken
          ? jwtExpiry(result.refreshToken, THIRTY_DAYS_MS)
          : handle.record.sessionExpiresAt,
      };
      sessions.set(key, next);
      return next;
    } catch {
      sessions.delete(key);
      return undefined;
    }
  })();

  inflightRefreshes.set(key, refresh);
  try {
    return await refresh;
  } finally {
    inflightRefreshes.delete(key);
  }
}

export async function accessTokenForRequest(
  request: NextRequest,
  force = false,
) {
  const handle = requestSession(request);
  if (!handle) return undefined;
  const record = await refreshSession(handle, force);
  return record?.accessToken;
}

export async function refreshCurrentWallet(request: NextRequest) {
  const handle = requestSession(request);
  if (!handle) return undefined;
  const record = await refreshSession(handle);
  if (!record) return undefined;
  try {
    const wallet = await getWalletsApi(record.accessToken).getWallet({
      cache: "no-store",
    });
    record.wallet = toViewerWallet(wallet);
    sessions.set(keyFor(handle.credential), record);
    return record.wallet;
  } catch (error) {
    if (
      error instanceof ResponseError &&
      (error.response.status === 401 || error.response.status === 403)
    ) {
      sessions.delete(keyFor(handle.credential));
      return undefined;
    }
    return record.wallet;
  }
}

export function updateStoredWallet(request: NextRequest, wallet: Wallet) {
  const handle = requestSession(request);
  if (!handle) return;
  handle.record.wallet = toViewerWallet(wallet);
  sessions.set(keyFor(handle.credential), handle.record);
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
) {
  const requestWithToken = (token: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return { ...init, headers };
  };

  const token = await accessTokenForRequest(request);
  if (!token) return new Response(null, { status: 401 });
  let response = await fetch(url, requestWithToken(token));
  if (response.status === 401) {
    const refreshed = await accessTokenForRequest(request, true);
    if (refreshed) response = await fetch(url, requestWithToken(refreshed));
  }
  return response;
}
