import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import { bindFaceHandoverToSession } from "@/api/face-handover";
import { establishSessionState, sessionIdHash } from "@/api/server-session";
import type { TenantContext } from "@/api/tenant";
import type { LoginOut } from "@/api/web-sdk/models/LoginOut";
import type { AuthenticationMethod } from "@/app/_domain/session";
import { toViewerWallet } from "@/app/_adapters/wallet";

/**
 * Establishes the wallet session for a sign-in, registration, passkey or EOA
 * connection, and settles any pending face handover against the account that
 * just signed in (contract r14, account isolation enforced on the server): an
 * anonymous ticket becomes this account's, one bound to another account is
 * cleared in this same response. False when the session was refused.
 */
export function establishWalletSession(
  request: NextRequest,
  response: NextResponse,
  login: LoginOut,
  tenant: TenantContext,
  authenticationMethod: AuthenticationMethod,
  persistent = false,
) {
  const state = establishSessionState(
    response,
    login,
    tenant,
    authenticationMethod,
    persistent,
  );
  if (!state) return false;
  bindFaceHandoverToSession(request, response, {
    walletId: toViewerWallet(login.wallet).id,
    sidHash: sessionIdHash(state)!,
  });
  return true;
}
