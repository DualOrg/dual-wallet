import { useEffect, useRef } from "react";
import { act, render, waitFor } from "@testing-library/react";
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

function ListenForEnd({
  onEnd,
  onReady,
}: {
  onEnd: (reason: string) => void;
  onReady?: (value: ReturnType<typeof useSession>) => void;
}) {
  const current = useSession();
  useEffect(() => current.onSessionEnd(onEnd), [current, onEnd]);
  useEffect(() => {
    onReady?.(current);
  }, [current, onReady]);
  return null;
}

test("an account change tells authenticated faces before its cache goes", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(sessionQueryKey, session("wallet-a"));
  loadSession.mockResolvedValue(session("wallet-b"));
  const onEnd = jest.fn();
  render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <ListenForEnd onEnd={onEnd} />
        <ReplaceSession walletId="wallet-b" />
      </SessionProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(onEnd).toHaveBeenCalledWith("account_changed"));
});

test("logout tells authenticated faces first, then revokes the session", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(sessionQueryKey, session("wallet-a"));
  const order: string[] = [];
  const { logoutSession } = jest.requireMock("@/app/_services/session.client");
  logoutSession.mockImplementation(async () => {
    order.push("revoke");
    return { ok: true };
  });
  let value: ReturnType<typeof useSession> | undefined;
  const onEnd = (reason: string) => order.push(`end:${reason}`);
  render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <ListenForEnd onEnd={onEnd} onReady={(next) => (value = next)} />
      </SessionProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(value).toBeDefined());
  await value!.logout();
  expect(order).toEqual(["end:logout", "revoke"]);
});

test("an expired session tells authenticated faces it ended", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(sessionQueryKey, session("wallet-a"));
  const onEnd = jest.fn();
  render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <ListenForEnd onEnd={onEnd} />
      </SessionProvider>
    </QueryClientProvider>,
  );
  expect(onEnd).not.toHaveBeenCalled();
  // A terminal 401 makes the session query resolve to null.
  act(() => client.setQueryData(sessionQueryKey, null));
  await waitFor(() => expect(onEnd).toHaveBeenCalledWith("expired"));
  expect(onEnd).toHaveBeenCalledTimes(1);
});
