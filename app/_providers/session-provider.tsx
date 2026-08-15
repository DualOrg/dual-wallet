"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
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
  refresh: () => Promise<ViewerWallet | null>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | undefined>(undefined);
export const sessionQueryKey = queryKeys.session.all;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery(sessionQueryOptions());

  const refresh = useCallback(async () => {
    const result = await refetch();
    return result.data?.wallet ?? null;
  }, [refetch]);
  const logout = useCallback(async () => {
    await logoutSession();
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
