import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ViewerWallet } from "@/app/_domain/wallet";
import { SettingsPageClient } from "@/app/_components/settings/settings-page-client";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const replace = jest.fn();
const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

const changePassword = jest.fn();
jest.mock("@/app/_services/wallet.client", () => ({
  changeWalletPassword: (input: unknown) => changePassword(input),
  updateWalletProfile: jest.fn(),
  deleteWalletAccount: jest.fn(),
}));

const logout = jest.fn();
const wallet = {
  id: "wallet-1",
  language: "en",
  account: { address: "0xaccount", type: "SMART_WALLET" },
  controller: {
    address: "0xcontroller",
    type: "SECP256K1",
    custody: "custodial",
  },
  smartAccount: { chainId: 1, validatorType: "ECDSA", version: "0.3.1" },
} as unknown as ViewerWallet;

jest.mock("@/app/_providers/session-provider", () => ({
  useSession: () => ({ wallet, logout, refresh: jest.fn() }),
}));

const renderSettings = () => {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SettingsPageClient />
    </QueryClientProvider>,
  );
};

const type = (label: string, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

beforeEach(() => {
  changePassword.mockReset().mockResolvedValue(undefined);
  logout.mockReset();
  replace.mockReset();
  refresh.mockReset();
});

describe("the settings password card", () => {
  it("sends the current password with the new one", async () => {
    renderSettings();
    type("currentPassword", "the old one");
    type("newPassword", "a longer new one");
    type("confirmPassword", "a longer new one");
    fireEvent.click(screen.getByRole("button", { name: "changePassword" }));

    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: "the old one",
        password: "a longer new one",
      }),
    );
  });

  // The API revokes every session on the wallet, this one included, so staying
  // on the page would leave a signed-in view backed by a dead refresh token.
  it("signs out and returns to login once the password has changed", async () => {
    renderSettings();
    type("currentPassword", "the old one");
    type("newPassword", "a longer new one");
    type("confirmPassword", "a longer new one");
    fireEvent.click(screen.getByRole("button", { name: "changePassword" }));

    await waitFor(() => expect(logout).toHaveBeenCalled());
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("does not send a change whose confirmation does not match", async () => {
    renderSettings();
    type("currentPassword", "the old one");
    type("newPassword", "a longer new one");
    type("confirmPassword", "a different one");
    fireEvent.click(screen.getByRole("button", { name: "changePassword" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(changePassword).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  // A refused change must leave the user signed in and on the page, which is
  // the whole reason the API answers a wrong current password with a 400.
  it("keeps the session when the API refuses the change", async () => {
    changePassword.mockRejectedValue(
      new Error("current password is incorrect"),
    );
    renderSettings();
    type("currentPassword", "wrong");
    type("newPassword", "a longer new one");
    type("confirmPassword", "a longer new one");
    fireEvent.click(screen.getByRole("button", { name: "changePassword" }));

    await waitFor(() => expect(changePassword).toHaveBeenCalled());
    expect(logout).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
