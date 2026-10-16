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
const listRetainedTransferSteps = jest.fn(async (): Promise<unknown[]> => []);
const readTransferProgress = jest.fn();
jest.mock("@/app/_services/product-face.client", () => ({
  executeSettleAction: (...args: unknown[]) =>
    executeSettleAction(...(args as [])),
  executeTransferAction: (...args: unknown[]) =>
    executeTransferAction(...(args as [])),
  takeFaceHandoverTicket: () => undefined,
  listFaceOperations: async () => [],
  listRetainedTransferSteps: (...args: unknown[]) =>
    listRetainedTransferSteps(...(args as [])),
  readTransferProgress: (...args: unknown[]) =>
    readTransferProgress(...(args as [])),
}));

let captured: ProductFaceHandlers | undefined;
let initialized: ((host: unknown) => void) | undefined;
const fakeHost = {
  session: { ended: null as SessionEndReason | null },
  end: jest.fn(),
  close: jest.fn(),
  restoreTask: jest.fn(),
  operationUpdated: jest.fn(),
};
jest.mock("@/app/_lib/external-face-bridge", () => ({
  startProductFaceBridge: (options: {
    handlers: ProductFaceHandlers;
    onInitialized?: (host: unknown) => void;
  }) => {
    captured = options.handlers;
    initialized = options.onInitialized;
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
        launchId: LAUNCH,
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
  operationId: "xfer-0123456789abcdef",
  objectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
  action: "transfer" as const,
  input: { to: "0x00000000000000000000000000000000000000b2" },
};
const settleStep = {
  operationId: "settle-0123456789abcdef",
  objectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
  action: "update",
  input: { data: { custom: { state: "Authenticity verified" } } },
};
const LAUNCH = `launch-${"h".repeat(28)}`;

/** The face binding the host handed to the executor on its last call. */
function boundFace(mock: jest.Mock) {
  const call = mock.mock.calls.at(-1) as unknown as [
    { face: { assertLive(): void } & Record<string, unknown> },
  ];
  return call[0].face;
}

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
    const { operationId: stepId, ...transferInput } = transferStep;
    expect(executeTransferAction).toHaveBeenCalledWith({
      ...transferInput,
      authenticationMethod: "email",
      controllerAddress: "0x00000000000000000000000000000000000000c1",
      face: expect.objectContaining({
        launchId: LAUNCH,
        slug: "morrow-home",
        operationId: stepId,
        walletId: "wallet-a",
      }),
    });
    const { operationId: settleId, ...settleInput } = settleStep;
    expect(executeSettleAction).toHaveBeenCalledWith({
      ...settleInput,
      authenticationMethod: "email",
      controllerAddress: "0x00000000000000000000000000000000000000c1",
      face: expect.objectContaining({
        launchId: LAUNCH,
        slug: "morrow-home",
        operationId: settleId,
        walletId: "wallet-a",
      }),
    });
    // Still the same live identity: the executor's own checks pass.
    expect(() => boundFace(executeTransferAction).assertLive()).not.toThrow();
    expect(() => boundFace(executeSettleAction).assertLive()).not.toThrow();
  });

  // contract r18: the identity is re-checked INSIDE the executor at each
  // async boundary (after prepare, while signing, before execute). The bound
  // face's live check therefore refuses as soon as anything changed after
  // the executor began, not only before it was called.
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
      "an ended launch",
      () => {
        fakeHost.session.ended = "account_changed";
      },
    ],
  ])(
    "the bound live check refuses after %s once the executor began",
    async (_label, change) => {
      const { hook, handlers } = launch();
      const began = handlers.executorIdentity()!;
      await handlers.executeTransfer(transferStep, began);
      await handlers.executeSettle(settleStep, began);
      const transferFace = boundFace(executeTransferAction);
      const settleFace = boundFace(executeSettleAction);
      act(() => change());
      hook.rerender();
      expect(() => transferFace.assertLive()).toThrow(
        expect.objectContaining({ code: "session_ended" }),
      );
      expect(() => settleFace.assertLive()).toThrow(
        expect.objectContaining({ code: "session_ended" }),
      );
    },
  );

  it("the bound live check refuses once the launch is torn down", async () => {
    const { hook, handlers } = launch();
    const began = handlers.executorIdentity()!;
    await handlers.executeTransfer(transferStep, began);
    const transferFace = boundFace(executeTransferAction);
    hook.unmount();
    expect(() => transferFace.assertLive()).toThrow(
      expect.objectContaining({ code: "session_ended" }),
    );
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

// Root's next journey: the sender signs in again and the face relaunches. The
// sender can no longer list or select the moved product, so the face cannot
// ask; the host finds the step its wallet already sent (the BFF's launch
// listing from this wallet's own sealed history) and reads its ORIGINAL
// correlation once, read-only, reporting only the runtime's answer.
describe("a transfer step this wallet sent from another launch", () => {
  beforeEach(() => {
    captured = undefined;
    initialized = undefined;
    fakeHost.session.ended = null;
    session = {
      wallet: accountA,
      authenticationMethod: "email",
      isAuthenticated: true,
      isLoading: false,
      refresh: jest.fn(),
      logout: jest.fn(),
      onSessionEnd: () => () => undefined,
    };
    listRetainedTransferSteps.mockReset();
    readTransferProgress.mockReset();
    executeTransferAction.mockClear();
  });

  it.each([
    ["transferred", { kind: "transfer_step", reason: "transferred" }],
    ["outcome_unknown", { kind: "transfer_step", reason: "outcome_unknown" }],
  ] as const)(
    "is read back on launch by its original id (%s), and nothing is signed or executed",
    async (status, notice) => {
      listRetainedTransferSteps.mockResolvedValue([
        {
          operation_id: "xfer-f0a31dc6781e57f040c2",
          kind: "transfer",
          operation: "transfer.transfer",
          object_id: "aaaaaaaaaaaaaaaaaaaaaaaa",
          case_id: null,
          phase: "submitted",
          status: null,
          action_id: "6ad178a32880577b1a494932",
        },
      ]);
      readTransferProgress.mockResolvedValue({ status, step: "transfer" });
      const { hook } = launch();
      await act(async () => {
        initialized?.(fakeHost);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(readTransferProgress).toHaveBeenCalledTimes(1);
      expect(readTransferProgress.mock.calls[0][1]).toBe(
        "xfer-f0a31dc6781e57f040c2",
      );
      expect(readTransferProgress.mock.calls[0]).toHaveLength(2);
      expect(hook.result.current.notice).toEqual(notice);
      expect(executeTransferAction).not.toHaveBeenCalled();
    },
  );

  it("reports nothing when no retained step is listed or its read fails", async () => {
    listRetainedTransferSteps.mockResolvedValue([]);
    const { hook } = launch();
    await act(async () => {
      initialized?.(fakeHost);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(readTransferProgress).not.toHaveBeenCalled();
    expect(hook.result.current.notice).toBeNull();
  });
});
