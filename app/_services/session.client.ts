import "client-only";

import type { AuthenticationMethod } from "@/app/_domain/session";
import type { ViewerWallet } from "@/app/_domain/wallet";
import { requestJson } from "@/app/_utils/client-api";

export interface SessionPayload {
  authenticated: boolean;
  authenticationMethod: AuthenticationMethod;
  wallet: ViewerWallet;
}

export async function loadSession({ signal }: { signal?: AbortSignal } = {}) {
  const response = await fetch("/api/session", {
    cache: "no-store",
    signal,
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Session could not be loaded.");
  return (await response.json()) as SessionPayload;
}

export function logoutSession() {
  return requestJson<{ ok: boolean }>("/api/session/logout", {
    method: "POST",
  });
}
