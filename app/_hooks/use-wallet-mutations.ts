"use client";

import { useMutation } from "@tanstack/react-query";
import { useSession } from "@/app/_providers/session-provider";
import {
  changeWalletPassword,
  deleteWalletAccount,
  updateWalletProfile,
} from "@/app/_services/wallet.client";

export function useUpdateWalletProfile() {
  const { refresh } = useSession();
  return useMutation({
    mutationFn: updateWalletProfile,
    onSuccess: () => refresh(),
  });
}

// A successful password change revokes every session on the wallet, this one
// included, so the sealed refresh token in the cookie is already dead. Signing
// out is the honest end to it — the alternative is a session that looks alive
// until its next refresh fails.
export function useChangeWalletPassword() {
  const { logout } = useSession();
  return useMutation({
    mutationFn: changeWalletPassword,
    onSuccess: () => logout(),
  });
}

export function useDeleteWalletAccount() {
  const { logout } = useSession();
  return useMutation({
    mutationFn: deleteWalletAccount,
    onSuccess: () => logout(),
  });
}
