import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProductFaceHostNotice } from "@/app/_lib/external-face-bridge/core/product-session";
import { application, HOLDER } from "@/test/product-face-fixtures";

// The host's own recovery when a launch's journal has no room left: the
// notice offers a new launch, which loads the face again under a fresh launch
// id (its own journal) and remounts the frame. The hook is stubbed so the
// notice can be shown without a live bridge.

jest.mock("next-intl", () => jest.requireActual("@/test/intl-mock").intlMock);
jest.mock("next/navigation", () => ({
  usePathname: () => "/products/morrow-home/service",
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
  }),
}));
jest.mock("@/app/_providers/session-provider", () => ({
  useSession: () => ({
    wallet: { id: "wallet-1", account: { address: HOLDER } },
    isAuthenticated: true,
    isLoading: false,
    onSessionEnd: () => () => undefined,
  }),
}));

const loadProductFaceContext = jest.fn();
jest.mock("@/app/_services/product-face.client", () => ({
  loadProductFaceContext: (...args: unknown[]) =>
    loadProductFaceContext(...args),
}));

let notice: ProductFaceHostNotice | null = null;
const launches: string[] = [];
jest.mock("@/app/_hooks/use-product-face-host", () => ({
  useProductFaceHost: ({ launchId }: { launchId: string }) => {
    if (launches.at(-1) !== launchId) launches.push(launchId);
    return {
      state: { status: "live" },
      confirmation: null,
      answerConfirmation: jest.fn(),
      onFrameLoad: jest.fn(),
      notice,
      dismissNotice: jest.fn(),
    };
  },
}));

import { ProductFaceHost } from "@/app/_components/products/product-face-host";

const frameUrl = `${application.origin}${application.path}`;

function renderHost() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProductFaceHost slug="morrow-home" />
    </QueryClientProvider>,
  );
}

describe("a launch whose journal has no room left", () => {
  beforeEach(() => {
    loadProductFaceContext.mockReset();
    loadProductFaceContext.mockResolvedValue({ application, frameUrl });
    launches.length = 0;
    notice = null;
  });

  it("offers a restart that opens the face under a new launch", async () => {
    notice = { kind: "launch_full", reason: "journal_full" };
    renderHost();
    const first = await screen.findByTitle(
      "Morrow Home Arc product application",
    );
    expect(
      screen.getByText(
        /has reached its request limit, so nothing was sent for this request/,
      ),
    ).toBeTruthy();
    const restart = screen.getByRole("button", {
      name: "Restart the application",
    });
    notice = null;
    act(() => restart.click());
    const second = await screen.findByTitle(
      "Morrow Home Arc product application",
    );
    expect(second).not.toBe(first);
    expect(launches).toHaveLength(2);
    expect(launches[1]).not.toBe(launches[0]);
    expect(
      loadProductFaceContext.mock.calls.map(([face]) => face.launchId),
    ).toEqual(launches);
  });

  it("offers no restart for any other notice", async () => {
    notice = { kind: "transfer_step", reason: "outcome_unknown" };
    renderHost();
    await screen.findByTitle("Morrow Home Arc product application");
    expect(
      screen.queryByRole("button", { name: "Restart the application" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
  });
});
