"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthenticationMethod } from "@/app/_domain/session";
import type { ViewerWallet } from "@/app/_domain/wallet";
import { queryKeys } from "@/app/_hooks/query-keys";
import { sessionQueryOptions } from "@/app/_hooks/query-options";
import { logoutSession } from "@/app/_services/session.client";

interface SessionValue {
  wallet: ViewerWallet | null;
  authenticationMethod: AuthenticationMethod | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refresh: (expectedWalletId?: string) => Promise<ViewerWallet | null>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | undefined>(undefined);
export const sessionQueryKey = queryKeys.session.all;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery(sessionQueryOptions());
  const walletIdRef = useRef(data?.wallet.id);

  const clearAccountQueries = useCallback(() => {
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== sessionQueryKey[0],
    });
  }, [queryClient]);

  useEffect(() => {
    const nextWalletId = data?.wallet.id;
    if (
      walletIdRef.current &&
      nextWalletId &&
      walletIdRef.current !== nextWalletId
    ) {
      clearAccountQueries();
    }
    walletIdRef.current = nextWalletId;
  }, [clearAccountQueries, data?.wallet.id]);

  const refresh = useCallback(
    async (expectedWalletId?: string) => {
      if (expectedWalletId && walletIdRef.current !== expectedWalletId) {
        clearAccountQueries();
      }
      const result = await refetch();
      const nextWalletId = result.data?.wallet.id;
      if (
        walletIdRef.current &&
        nextWalletId &&
        walletIdRef.current !== nextWalletId
      ) {
        clearAccountQueries();
      }
      walletIdRef.current = nextWalletId;
      return result.data?.wallet ?? null;
    },
    [clearAccountQueries, refetch],
  );
  const logout = useCallback(async () => {
    await logoutSession();
    walletIdRef.current = undefined;
    queryClient.setQueryData(sessionQueryKey, null);
    queryClient.clear();
  }, [queryClient]);
  const value = useMemo<SessionValue>(
    () => ({
      wallet: data?.wallet ?? null,
      authenticationMethod: data?.authenticationMethod ?? null,
      isLoading,
      isAuthenticated: Boolean(data?.authenticated),
      refresh,
      logout,
    }),
    [data, isLoading, logout, refresh],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used within SessionProvider");
  return value;
}
