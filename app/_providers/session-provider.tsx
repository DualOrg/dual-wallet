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
import type { SessionEndReason } from "@/app/_domain/product-face";
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
  /**
   * Notifies before a signed-in wallet session stops being usable here:
   * logout (before the session is revoked), expiry, or an account change.
   * Hosts of authenticated faces use it to end their channels first.
   */
  onSessionEnd: (listener: (reason: SessionEndReason) => void) => () => void;
}

const SessionContext = createContext<SessionValue | undefined>(undefined);
export const sessionQueryKey = queryKeys.session.all;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery(sessionQueryOptions());
  const walletIdRef = useRef(data?.wallet.id);
  const endListeners = useRef(new Set<(reason: SessionEndReason) => void>());
  const signedInRef = useRef(Boolean(data?.authenticated));
  const loggingOut = useRef(false);

  const notifySessionEnd = useCallback((reason: SessionEndReason) => {
    for (const listener of Array.from(endListeners.current)) listener(reason);
  }, []);

  const onSessionEnd = useCallback(
    (listener: (reason: SessionEndReason) => void) => {
      endListeners.current.add(listener);
      return () => {
        endListeners.current.delete(listener);
      };
    },
    [],
  );

  useEffect(() => {
    const signedIn = Boolean(data?.authenticated);
    if (signedInRef.current && !signedIn && !loggingOut.current) {
      notifySessionEnd("expired");
    }
    signedInRef.current = signedIn;
  }, [data?.authenticated, notifySessionEnd]);

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
      notifySessionEnd("account_changed");
      clearAccountQueries();
    }
    walletIdRef.current = nextWalletId;
  }, [clearAccountQueries, data?.wallet.id, notifySessionEnd]);

  const refresh = useCallback(
    async (expectedWalletId?: string) => {
      if (expectedWalletId && walletIdRef.current !== expectedWalletId) {
        if (walletIdRef.current) notifySessionEnd("account_changed");
        clearAccountQueries();
      }
      const result = await refetch();
      const nextWalletId = result.data?.wallet.id;
      if (
        walletIdRef.current &&
        nextWalletId &&
        walletIdRef.current !== nextWalletId
      ) {
        notifySessionEnd("account_changed");
        clearAccountQueries();
      }
      walletIdRef.current = nextWalletId;
      return result.data?.wallet ?? null;
    },
    [clearAccountQueries, notifySessionEnd, refetch],
  );
  const logout = useCallback(async () => {
    loggingOut.current = true;
    // Faces hear about it while the session can still be described as ended
    // by the user, before the cookie and the cached account go away.
    notifySessionEnd("logout");
    try {
      await logoutSession();
      walletIdRef.current = undefined;
      signedInRef.current = false;
      queryClient.setQueryData(sessionQueryKey, null);
      queryClient.clear();
    } finally {
      loggingOut.current = false;
    }
  }, [notifySessionEnd, queryClient]);
  const value = useMemo<SessionValue>(
    () => ({
      wallet: data?.wallet ?? null,
      authenticationMethod: data?.authenticationMethod ?? null,
      isLoading,
      isAuthenticated: Boolean(data?.authenticated),
      refresh,
      logout,
      onSessionEnd,
    }),
    [data, isLoading, logout, onSessionEnd, refresh],
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
