"use client";

import { useMutation } from "@tanstack/react-query";
import { useSession } from "@/app/_providers/session-provider";
import {
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

export function useDeleteWalletAccount() {
  const { logout } = useSession();
  return useMutation({
    mutationFn: deleteWalletAccount,
    onSuccess: () => logout(),
  });
}
