import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProductFaceHostNotice } from "@/app/_lib/external-face-bridge/core/product-session";
import { application, HOLDER } from "@/test/product-face-fixtures";

// Proposed contract r20 (PROPOSED, not deployed): the host's own notice for
// the outcomes the runtime listed durably for this wallet's earlier
// operations. One plain line per item in the host's words (never face text),
// the incomplete line when not every runtime scan ran to its end, and the
// Dismiss control that lets the hook acknowledge what the person has seen.
// The hook is stubbed so the notice can be shown without a live bridge.

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
const dismissNotice = jest.fn();
const continueRecovery = jest.fn();
jest.mock("@/app/_hooks/use-product-face-host", () => ({
  useProductFaceHost: () => ({
    state: { status: "live" },
    confirmation: null,
    answerConfirmation: jest.fn(),
    onFrameLoad: jest.fn(),
    notice,
    dismissNotice,
    continueRecovery,
  }),
}));

import { ProductFaceHost } from "@/app/_components/products/product-face-host";

const frameUrl = `${application.origin}${application.path}`;

type RecoveryItem = Extract<
  ProductFaceHostNotice,
  { kind: "recovery" }
>["items"][number];

const item = (
  operationId: string,
  kind: RecoveryItem["kind"],
  outcome: RecoveryItem["outcome"],
  acknowledgeable = false,
): RecoveryItem => ({
  operationId,
  kind,
  operation:
    kind === "registration"
      ? "registration.submit"
      : kind === "settle"
        ? "registration.settle"
        : kind === "transfer"
          ? "transfer.transfer"
          : "case.open",
  step: kind === "transfer" ? "transfer" : null,
  outcome,
  acknowledgeable,
});

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

describe("the recovery notice (proposed contract r20)", () => {
  beforeEach(() => {
    loadProductFaceContext.mockReset();
    loadProductFaceContext.mockResolvedValue({ application, frameUrl });
    dismissNotice.mockReset();
    continueRecovery.mockReset();
    notice = null;
  });

  it("offers Continue checking while items remain, and says so, without calling it incomplete", async () => {
    notice = {
      kind: "recovery",
      complete: true,
      moreToCheck: true,
      items: [item("case-3", "runtime", "outcome_unknown")],
    };
    renderHost();
    await screen.findByTitle("Morrow Home Arc product application");
    expect(
      screen.getByText("There are more earlier requests to check.").tagName,
    ).toBe("P");
    expect(
      screen.queryByText(
        "Not every earlier request could be checked this time. Nothing was sent again.",
      ),
    ).toBeNull();
    const button = screen.getByRole("button", { name: "Continue checking" });
    expect(continueRecovery).not.toHaveBeenCalled();
    act(() => button.click());
    expect(continueRecovery).toHaveBeenCalledTimes(1);
    expect(dismissNotice).not.toHaveBeenCalled();
  });

  it("offers no Continue checking when nothing remains", async () => {
    notice = {
      kind: "recovery",
      complete: false,
      moreToCheck: false,
      items: [item("case-3", "runtime", "outcome_unknown")],
    };
    renderHost();
    await screen.findByTitle("Morrow Home Arc product application");
    expect(
      screen.queryByRole("button", { name: "Continue checking" }),
    ).toBeNull();
    expect(
      screen.getByText(
        "Not every earlier request could be checked this time. Nothing was sent again.",
      ),
    ).toBeTruthy();
  });

  it("renders one plain line per listed outcome, in the host's own words", async () => {
    notice = {
      kind: "recovery",
      complete: true,
      moreToCheck: false,
      items: [
        item("reg-1", "registration", "registered", true),
        item("settle-1", "settle", "registered", true),
        item("xfer-1", "transfer", "transfer_request_committed", true),
        item("xfer-2", "transfer", "transferred", true),
        item("case-1", "runtime", "write_applied", true),
        item("case-2", "runtime", "write_refused"),
        item("case-3", "runtime", "outcome_unknown"),
        item("xfer-3", "transfer", "not_checked"),
      ],
    };
    renderHost();
    await screen.findByTitle("Morrow Home Arc product application");
    const lines = [
      "Your registration of this product is complete.",
      "morrow-home's confirmation of this product is complete.",
      "Your transfer request was recorded. The handover itself has not been done yet.",
      "Your transfer is complete: the product now belongs to the recipient's wallet.",
      "A service request you sent earlier was received.",
      "A request you sent earlier was not accepted. Nothing was changed.",
      "A request you sent earlier is still being confirmed. It will not be sent again.",
      "One earlier request could not be checked this time.",
    ];
    for (const line of lines) {
      expect(screen.getByText(line).tagName).toBe("P");
    }
    const status = screen.getByText(lines[0]).closest(".product-face-notice");
    expect(status?.querySelectorAll("p")).toHaveLength(lines.length);
    // Nothing of the item beyond its outcome is shown: no ids, no operation
    // names, nothing re-sent.
    expect(status?.textContent).not.toMatch(/reg-1|xfer-|case-|\.submit/);
    expect(
      screen.queryByText(/Not every earlier request could be checked/),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Restart the application" }),
    ).toBeNull();
  });

  it("says when not every earlier request could be checked, and that nothing was sent again", async () => {
    notice = {
      kind: "recovery",
      complete: false,
      moreToCheck: false,
      items: [item("xfer-2", "transfer", "transferred")],
    };
    renderHost();
    await screen.findByTitle("Morrow Home Arc product application");
    expect(
      screen.getByText(
        "Your transfer is complete: the product now belongs to the recipient's wallet.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Not every earlier request could be checked this time. Nothing was sent again.",
      ).tagName,
    ).toBe("P");
  });

  it("reports an incomplete check even when nothing was listed", async () => {
    notice = {
      kind: "recovery",
      complete: false,
      moreToCheck: false,
      items: [],
    };
    renderHost();
    await screen.findByTitle("Morrow Home Arc product application");
    expect(
      screen.getByText(
        "Not every earlier request could be checked this time. Nothing was sent again.",
      ),
    ).toBeTruthy();
  });

  it("Dismiss hands the notice back to the hook, which decides what to acknowledge", async () => {
    notice = {
      kind: "recovery",
      complete: true,
      moreToCheck: false,
      items: [item("xfer-2", "transfer", "transferred", true)],
    };
    renderHost();
    await screen.findByTitle("Morrow Home Arc product application");
    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    act(() => dismiss.click());
    expect(dismissNotice).toHaveBeenCalledTimes(1);
  });

  it("keeps the other notices as they are", async () => {
    notice = { kind: "transfer_step", reason: "transferred" };
    renderHost();
    await screen.findByTitle("Morrow Home Arc product application");
    expect(
      screen.getByText(
        /Its private details and service requests are no longer/,
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
  });
});
