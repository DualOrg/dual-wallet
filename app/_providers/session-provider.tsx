"use client";

import { createContext, useContext, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ViewerWallet } from "@/app/_domain/wallet";
import { requestJson } from "@/app/_utils/client-api";

interface SessionPayload {
  authenticated: boolean;
  wallet: ViewerWallet;
}

interface SessionValue {
  wallet: ViewerWallet | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refresh: () => Promise<ViewerWallet | null>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | undefined>(undefined);
export const sessionQueryKey = ["viewer-session"] as const;

async function loadSession() {
  const response = await fetch("/api/session", { cache: "no-store" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Session could not be loaded.");
  return (await response.json()) as SessionPayload;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: sessionQueryKey,
    queryFn: loadSession,
    retry: false,
    staleTime: 30_000,
  });

  const value = useMemo<SessionValue>(
    () => ({
      wallet: query.data?.wallet ?? null,
      isLoading: query.isLoading,
      isAuthenticated: Boolean(query.data?.authenticated),
      refresh: async () => {
        const result = await query.refetch();
        return result.data?.wallet ?? null;
      },
      logout: async () => {
        await requestJson<{ ok: boolean }>("/api/session/logout", {
          method: "POST",
        });
        queryClient.setQueryData(sessionQueryKey, null);
        queryClient.clear();
      },
    }),
    [query, queryClient],
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
