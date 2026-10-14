import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ProductFaceError,
  type SessionEndReason,
} from "@/app/_domain/product-face";
import { application, HOLDER } from "@/test/product-face-fixtures";

jest.mock("next-intl", () => jest.requireActual("@/test/intl-mock").intlMock);
jest.mock("next/navigation", () => ({
  usePathname: () => "/products/morrow-home/register",
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
  }),
}));

let endListener: ((reason: SessionEndReason) => void) | undefined;
const session = {
  wallet: {
    id: "wallet-1",
    account: { address: HOLDER },
    controller: { address: "0xcontroller" },
  },
  authenticationMethod: "email",
  isAuthenticated: true,
  isLoading: false,
  refresh: jest.fn(),
  logout: jest.fn(),
  onSessionEnd: (listener: (reason: SessionEndReason) => void) => {
    endListener = listener;
    return () => {
      endListener = undefined;
    };
  },
};
jest.mock("@/app/_providers/session-provider", () => ({
  useSession: () => session,
}));

const loadProductFaceContext = jest.fn();
jest.mock("@/app/_services/product-face.client", () => ({
  loadProductFaceContext: (...args: unknown[]) =>
    loadProductFaceContext(...args),
}));

import { ProductFaceHost } from "@/app/_components/products/product-face-host";

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

const frameUrl = `${application.origin}${application.path}`;

describe("ProductFaceHost", () => {
  beforeEach(() => {
    loadProductFaceContext.mockReset();
    endListener = undefined;
  });

  it("frames the verified application full-size with a restrictive sandbox", async () => {
    loadProductFaceContext.mockResolvedValue({ application, frameUrl });
    renderHost();
    const frame = await screen.findByTitle(
      "Morrow Home Arc product application",
    );
    expect(frame.getAttribute("src")).toBe(frameUrl);
    expect(frame.getAttribute("sandbox")).toBe(
      "allow-scripts allow-same-origin allow-forms",
    );
    expect(frame.getAttribute("sandbox")).not.toMatch(/popups|top-navigation/);
    expect(frame.getAttribute("allow")).toBe("");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(
      screen.getByRole("heading", { name: "Morrow Home Arc" }),
    ).toBeTruthy();
    expect(screen.getByText("Published by morrow-home")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Back to products" })
        .getAttribute("href"),
    ).toBe("/products");
  });

  it("renders no frame when the artifact does not verify", async () => {
    loadProductFaceContext.mockRejectedValue(
      new ProductFaceError("artifact_mismatch", 409),
    );
    renderHost();
    expect(
      await screen.findByText(
        "This product application could not be verified, so it was not opened.",
      ),
    ).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("removes the frame when the wallet session ends", async () => {
    loadProductFaceContext.mockResolvedValue({ application, frameUrl });
    renderHost();
    await screen.findByTitle("Morrow Home Arc product application");
    act(() => endListener?.("logout"));
    await waitFor(() => expect(document.querySelector("iframe")).toBeNull());
    expect(
      screen.getByText(
        "You signed out, so the product application was closed.",
      ),
    ).toBeTruthy();
    expect(loadProductFaceContext).toHaveBeenCalledTimes(1);
  });
});
