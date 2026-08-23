"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useSession } from "@/app/_providers/session-provider";
import {
  requestPasswordReset,
  requestVerificationCode,
  setNewPassword,
  verifyAccount,
} from "@/app/_services/account.client";

export function useVerifyAccount() {
  const session = useSession();
  const router = useRouter();
  return useMutation({
    mutationFn: verifyAccount,
    onSuccess: async () => {
      // A link may be followed with no session at all, so where to go next
      // depends on whether there is one to go with.
      const wallet = await session.refresh();
      router.replace(wallet ? "/inventory" : "/login");
      router.refresh();
    },
  });
}

export function useRequestVerificationCode() {
  return useMutation({ mutationFn: requestVerificationCode });
}

export function useRequestPasswordReset() {
  return useMutation({ mutationFn: requestPasswordReset });
}

export function useSetNewPassword() {
  return useMutation({ mutationFn: setNewPassword });
}
