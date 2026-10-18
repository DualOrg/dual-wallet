"use client";

import { createContext, useContext } from "react";
import type { HostPresentation } from "@/app/_domain/wallet-host";

// The branded host's presentation (null: the generic wallet). Read on the
// server from the validated host configuration and handed down as plain data;
// it carries nothing that authorizes anything.
const HostContext = createContext<HostPresentation | null>(null);

export function HostProvider({
  host,
  children,
}: {
  host: HostPresentation | null;
  children: React.ReactNode;
}) {
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>;
}

export function useHostPresentation() {
  return useContext(HostContext);
}
