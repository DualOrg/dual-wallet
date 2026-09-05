import { useEffect, useRef } from "react";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ViewerWallet } from "@/app/_domain/wallet";
import type { SessionPayload } from "@/app/_services/session.client";

const loadSession = jest.fn();
jest.mock("@/app/_services/session.client", () => ({
  loadSession: (...args: unknown[]) => loadSession(...args),
  logoutSession: jest.fn(),
}));

import {
  SessionProvider,
  sessionQueryKey,
  useSession,
} from "@/app/_providers/session-provider";

const wallet = (id: string) => ({ id }) as ViewerWallet;
const session = (id: string): SessionPayload => ({
  authenticated: true,
  authenticationMethod: "email",
  wallet: wallet(id),
});

function ReplaceSession({ walletId }: { walletId: string }) {
  const current = useSession();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void current.refresh(walletId);
  }, [current, walletId]);
  return null;
}

function renderSession(
  client: QueryClient,
  currentWalletId: string,
  nextWalletId: string,
) {
  client.setQueryData(sessionQueryKey, session(currentWalletId));
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <ReplaceSession walletId={nextWalletId} />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => loadSession.mockReset());

test("replacing an authenticated wallet removes the previous account's cache", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const inventoryKey = ["inventory", "list", { search: "" }] as const;
  const activityKey = ["activity", "page", { walletId: "wallet-a" }] as const;
  client.setQueryData(inventoryKey, { objects: ["account-a-object"] });
  client.setQueryData(activityKey, { actions: ["account-a-action"] });
  loadSession.mockResolvedValue(session("wallet-b"));

  renderSession(client, "wallet-a", "wallet-b");

  await waitFor(() => expect(loadSession).toHaveBeenCalledTimes(1));
  expect(client.getQueryData(inventoryKey)).toBeUndefined();
  expect(client.getQueryData(activityKey)).toBeUndefined();
});

test("refreshing the same wallet preserves its account cache", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const inventoryKey = ["inventory", "list", { search: "" }] as const;
  client.setQueryData(inventoryKey, { objects: ["account-a-object"] });
  loadSession.mockResolvedValue(session("wallet-a"));

  renderSession(client, "wallet-a", "wallet-a");

  await waitFor(() => expect(loadSession).toHaveBeenCalledTimes(1));
  expect(client.getQueryData(inventoryKey)).toEqual({
    objects: ["account-a-object"],
  });
});
