"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HostPresentation } from "@/app/_domain/wallet-host";
import { HostProvider } from "@/app/_providers/host-provider";
import { SessionProvider } from "@/app/_providers/session-provider";
import { ThemeProvider } from "@/app/_providers/theme-provider";

export function Providers({
  children,
  host = null,
}: {
  children: React.ReactNode;
  host?: HostPresentation | null;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <HostProvider host={host}>
        <ThemeProvider>
          <SessionProvider>{children}</SessionProvider>
        </ThemeProvider>
      </HostProvider>
    </QueryClientProvider>
  );
}
