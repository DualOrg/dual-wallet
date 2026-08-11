"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PasskeyLoginOptionsOut } from "@/api/web-sdk/models/PasskeyLoginOptionsOut";
import type { PasskeyRegisterOptionsOut } from "@/api/web-sdk/models/PasskeyRegisterOptionsOut";
import type { ViewerWallet } from "@/app/_domain/wallet";
import { useSession } from "@/app/_providers/session-provider";
import { requestJson } from "@/app/_utils/client-api";
import { createPasskey, getPasskey } from "@/app/_utils/webauthn";

interface AuthResult {
  authenticated: true;
  wallet: ViewerWallet;
  needsVerification?: boolean;
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

export function useAuthActions() {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const session = useSession();

  const finish = async (result: AuthResult) => {
    await session.refresh();
    router.replace(
      result.needsVerification || !result.wallet.activated
        ? "/verify"
        : "/inventory",
    );
    router.refresh();
  };

  const run = async (name: string, action: () => Promise<AuthResult>) => {
    setPending(name);
    setError(null);
    try {
      await finish(await action());
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong.",
      );
    } finally {
      setPending(null);
    }
  };

  return {
    pending,
    error,
    clearError: () => setError(null),
    emailLogin: (email: string, password: string) =>
      run("email", () =>
        requestJson<AuthResult>("/api/session/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        }),
      ),
    emailRegister: (email: string, password: string, nickname: string) =>
      run("email", () =>
        requestJson<AuthResult>("/api/session/register", {
          method: "POST",
          body: JSON.stringify({ email, password, nickname }),
        }),
      ),
    eoa: () =>
      run("wallet", async () => {
        if (!window.ethereum)
          throw new Error("No compatible browser wallet was found.");
        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        const address =
          Array.isArray(accounts) && typeof accounts[0] === "string"
            ? accounts[0]
            : undefined;
        if (!address) throw new Error("The wallet did not provide an account.");
        const { challenge } = await requestJson<{ challenge: string }>(
          "/api/session/eoa/challenge",
        );
        const signature = await window.ethereum.request({
          method: "personal_sign",
          params: [messageHex(challenge), address],
        });
        if (typeof signature !== "string")
          throw new Error("The wallet did not return a signature.");
        return requestJson<AuthResult>("/api/session/eoa/connect", {
          method: "POST",
          body: JSON.stringify({ challenge, signature }),
        });
      }),
    passkeyLogin: () =>
      run("passkey", async () => {
        const options = await requestJson<PasskeyLoginOptionsOut>(
          "/api/session/passkey/login/options",
          { method: "POST" },
        );
        const credential = await getPasskey(options);
        return requestJson<AuthResult>("/api/session/passkey/login/verify", {
          method: "POST",
          body: JSON.stringify(credential),
        });
      }),
    passkeyRegister: () =>
      run("passkey", async () => {
        const options = await requestJson<PasskeyRegisterOptionsOut>(
          "/api/session/passkey/register/options",
        );
        const credential = await createPasskey(options);
        return requestJson<AuthResult>("/api/session/passkey/register/verify", {
          method: "POST",
          body: JSON.stringify(credential),
        });
      }),
  };
}
