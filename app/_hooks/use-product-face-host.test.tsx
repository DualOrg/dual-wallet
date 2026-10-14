import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SessionEndReason } from "@/app/_domain/product-face";
import type { ProductFaceHandlers } from "@/app/_lib/external-face-bridge";
import { application, HOLDER } from "@/test/product-face-fixtures";

// The host's own executors (defence in depth): a holder-signed settle or
// transfer step is executed only while this launch is live and the CURRENT
// wallet session is exactly the identity the operation began with. These
// tests drive the real hook; the bridge and the wallet services are local
// fakes, and nothing is signed or sent.

jest.mock("next/navigation", () => ({
  usePathname: () => "/products/morrow-home/products",
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
  }),
}));

type FakeSession = {
  wallet: {
    id: string;
    account: { address: string };
    controller: { address: string };
  } | null;
  authenticationMethod: "email" | "passkey" | "eoa" | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  refresh: jest.Mock;
  logout: jest.Mock;
  onSessionEnd: (listener: (reason: SessionEndReason) => void) => () => void;
};
const accountA = {
  id: "wallet-a",
  account: { address: HOLDER },
  controller: { address: "0x00000000000000000000000000000000000000c1" },
};
const accountB = {
  id: "wallet-b",
  account: { address: "0x00000000000000000000000000000000000000b2" },
  controller: { address: "0x00000000000000000000000000000000000000c2" },
};
let session: FakeSession;
jest.mock("@/app/_providers/session-provider", () => ({
  useSession: () => session,
}));

const executeSettleAction = jest.fn(async () => ({
  actionId: "action-settle",
}));
const executeTransferAction = jest.fn(async () => ({
  actionId: "action-transfer",
}));
jest.mock("@/app/_services/product-face.client", () => ({
  executeSettleAction: (...args: unknown[]) =>
    executeSettleAction(...(args as [])),
  executeTransferAction: (...args: unknown[]) =>
    executeTransferAction(...(args as [])),
  takeFaceHandoverTicket: () => undefined,
  listFaceOperations: async () => [],
}));

let captured: ProductFaceHandlers | undefined;
const fakeHost = {
  session: { ended: null as SessionEndReason | null },
  end: jest.fn(),
  close: jest.fn(),
  restoreTask: jest.fn(),
  operationUpdated: jest.fn(),
};
jest.mock("@/app/_lib/external-face-bridge", () => ({
  startProductFaceBridge: (options: { handlers: ProductFaceHandlers }) => {
    captured = options.handlers;
    return fakeHost;
  },
}));

import { useProductFaceHost } from "@/app/_hooks/use-product-face-host";

function launch() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () =>
      useProductFaceHost({
        slug: "morrow-home",
        launchId: `launch-${"h".repeat(28)}`,
        application,
        frameUrl: `${application.origin}${application.path}`,
        onEnded: jest.fn(),
      }),
    { wrapper },
  );
  act(() => hook.result.current.onFrameLoad(document.createElement("iframe")));
  if (!captured) throw new Error("the bridge was not started");
  return { hook, handlers: captured };
}

const transferStep = {
  objectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
  action: "transfer" as const,
  input: { to: "0x00000000000000000000000000000000000000b2" },
};
const settleStep = {
  objectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
  action: "update",
  input: { data: { custom: { state: "Authenticity verified" } } },
};

describe("the host executors sign only as the identity that began the operation", () => {
  beforeEach(() => {
    captured = undefined;
    fakeHost.session.ended = null;
    executeSettleAction.mockClear();
    executeTransferAction.mockClear();
    session = {
      wallet: accountA,
      authenticationMethod: "email",
      isAuthenticated: true,
      isLoading: false,
      refresh: jest.fn(),
      logout: jest.fn(),
      onSessionEnd: () => () => undefined,
    };
  });

  it("executes as the captured identity while it is still the live session", async () => {
    const { handlers } = launch();
    const began = handlers.executorIdentity()!;
    expect(began).toEqual({
      walletId: "wallet-a",
      holder: HOLDER.toLowerCase(),
      authenticationMethod: "email",
      controller: "0x00000000000000000000000000000000000000c1",
    });
    await expect(
      handlers.executeTransfer(transferStep, began),
    ).resolves.toEqual({ actionId: "action-transfer" });
    await expect(handlers.executeSettle(settleStep, began)).resolves.toEqual({
      actionId: "action-settle",
    });
    expect(executeTransferAction).toHaveBeenCalledWith({
      ...transferStep,
      authenticationMethod: "email",
      controllerAddress: "0x00000000000000000000000000000000000000c1",
    });
  });

  it.each([
    [
      "an account change A to B",
      () => {
        session = { ...session, wallet: accountB };
      },
    ],
    [
      "a logout",
      () => {
        session = {
          ...session,
          wallet: null,
          authenticationMethod: null,
          isAuthenticated: false,
        };
      },
    ],
    [
      "another sign-in method",
      () => {
        session = { ...session, authenticationMethod: "passkey" };
      },
    ],
    [
      "another controller",
      () => {
        session = {
          ...session,
          wallet: {
            ...accountA,
            controller: {
              address: "0x00000000000000000000000000000000000000c9",
            },
          },
        };
      },
    ],
    [
      "an ended launch",
      () => {
        fakeHost.session.ended = "account_changed";
      },
    ],
  ])("refuses before anything is signed after %s", async (_label, change) => {
    const { hook, handlers } = launch();
    const began = handlers.executorIdentity()!;
    act(() => change());
    hook.rerender();
    await expect(
      handlers.executeTransfer(transferStep, began),
    ).rejects.toMatchObject({ code: "session_ended" });
    await expect(
      handlers.executeSettle(settleStep, began),
    ).rejects.toMatchObject({ code: "session_ended" });
    expect(executeTransferAction).not.toHaveBeenCalled();
    expect(executeSettleAction).not.toHaveBeenCalled();
  });

  it("refuses for a launch that was torn down or replaced", async () => {
    const first = launch();
    const began = first.handlers.executorIdentity()!;
    first.hook.unmount();
    await expect(
      first.handlers.executeTransfer(transferStep, began),
    ).rejects.toMatchObject({ code: "session_ended" });
    expect(executeTransferAction).not.toHaveBeenCalled();
  });
});
