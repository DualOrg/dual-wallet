import "client-only";

import type { PasskeyLoginOptionsOut } from "@/api/web-sdk/models/PasskeyLoginOptionsOut";
import type { PasskeyRegisterOptionsOut } from "@/api/web-sdk/models/PasskeyRegisterOptionsOut";
import { createPasskey, getPasskey } from "@/app/_adapters/webauthn.client";
import type { ViewerWallet } from "@/app/_domain/wallet";
import { requestJson } from "@/app/_utils/client-api";

export interface AuthResult {
  authenticated: true;
  wallet: ViewerWallet;
  needsVerification?: boolean;
}

export type AuthFlowErrorCode =
  "wallet_unavailable" | "wallet_account_missing" | "wallet_signature_missing";

export class AuthFlowError extends Error {
  constructor(public readonly code: AuthFlowErrorCode) {
    super(code);
    this.name = "AuthFlowError";
  }
}

declare global {
  interface Window {
    ethereum?: {
      request: (input: {
        method: string;
        params?: unknown[];
      }) => Promise<unknown>;
    };
  }
}

function messageHex(value: string) {
  return `0x${Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function emailLogin(email: string, password: string) {
  return requestJson<AuthResult>("/api/session/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function emailRegister(
  email: string,
  password: string,
  nickname: string,
) {
  return requestJson<AuthResult>("/api/session/register", {
    method: "POST",
    body: JSON.stringify({ email, password, nickname }),
  });
}

export async function connectEoa() {
  if (!window.ethereum) throw new AuthFlowError("wallet_unavailable");
  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts",
  });
  const address =
    Array.isArray(accounts) && typeof accounts[0] === "string"
      ? accounts[0]
      : undefined;
  if (!address) throw new AuthFlowError("wallet_account_missing");
  const { challenge } = await requestJson<{ challenge: string }>(
    "/api/session/eoa/challenge",
  );
  const signature = await window.ethereum.request({
    method: "personal_sign",
    params: [messageHex(challenge), address],
  });
  if (typeof signature !== "string") {
    throw new AuthFlowError("wallet_signature_missing");
  }
  return requestJson<AuthResult>("/api/session/eoa/connect", {
    method: "POST",
    body: JSON.stringify({ challenge, signature }),
  });
}

export async function loginWithPasskey() {
  const options = await requestJson<PasskeyLoginOptionsOut>(
    "/api/session/passkey/login/options",
    { method: "POST" },
  );
  const credential = await getPasskey(options);
  return requestJson<AuthResult>("/api/session/passkey/login/verify", {
    method: "POST",
    body: JSON.stringify(credential),
  });
}

export async function registerWithPasskey() {
  const options = await requestJson<PasskeyRegisterOptionsOut>(
    "/api/session/passkey/register/options",
  );
  const credential = await createPasskey(options);
  return requestJson<AuthResult>("/api/session/passkey/register/verify", {
    method: "POST",
    body: JSON.stringify(credential),
  });
}
