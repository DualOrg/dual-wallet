"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useErrorMessage } from "@/app/_hooks/use-error-message";
import { useSession } from "@/app/_providers/session-provider";
import {
  AuthFlowError,
  connectEoa,
  emailLogin,
  emailRegister,
  otpLogin,
  loginWithPasskey,
  registerWithPasskey,
  type AuthResult,
} from "@/app/_services/auth.client";

export function useAuthActions() {
  const router = useRouter();
  const session = useSession();
  const t = useTranslations("auth.errors");
  const errorMessage = useErrorMessage();

  const finish = async (result: AuthResult) => {
    await session.refresh(result.wallet.id);
    router.replace(result.needsVerification ? "/verify" : "/inventory");
    router.refresh();
  };

  const mutation = useMutation({
    mutationFn: ({
      action,
    }: {
      name: string;
      action: () => Promise<AuthResult>;
    }) => action(),
    onSuccess: finish,
  });

  const error = mutation.error
    ? mutation.error instanceof AuthFlowError
      ? t(mutation.error.code)
      : errorMessage(mutation.error)
    : null;
  const run = (name: string, action: () => Promise<AuthResult>) => {
    mutation.mutate({ name, action });
  };

  return {
    pending: mutation.isPending ? (mutation.variables?.name ?? null) : null,
    error,
    clearError: mutation.reset,
    emailLogin: (email: string, password: string, remember = false) =>
      run("email", () => emailLogin(email, password, remember)),
    otpLogin: (email: string, otp: string) =>
      run("email", () => otpLogin(email, otp)),
    emailRegister: (email: string, password: string, nickname: string) =>
      run("email", () => emailRegister(email, password, nickname)),
    eoa: (remember = false) => run("wallet", () => connectEoa(remember)),
    passkeyLogin: (remember = false) =>
      run("passkey", () => loginWithPasskey(remember)),
    passkeyRegister: () => run("passkey", registerWithPasskey),
  };
}
