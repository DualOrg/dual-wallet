import { fireEvent, render, screen } from "@testing-library/react";
import type { ViewerWallet } from "@/app/_domain/wallet";
import { UserProfileMenu } from "@/app/_components/user-profile-menu";

jest.mock("next-intl", () => ({
  useTranslations:
    () =>
    (key: string): string =>
      ({
        account: "Your account",
        open: "Open user profile",
        close: "Close user profile",
        title: "User profile",
        noEmail: "No email address",
        smartAccount: "Smart account",
        controller: "Controller",
        manage: "Manage profile",
      })[key] ?? key,
}));

const wallet = {
  id: "wallet-1",
  nickname: "ww",
  email: "ww@example.com",
  language: "en",
  fqdn: "demo.localhost",
  activated: true,
  emailVerified: true,
  disabled: false,
  account: {
    address: "0x1234567890abcdef1234567890abcdef12345f45",
    type: "SMART_WALLET",
  },
  controller: {
    address: "0xcontroller",
    type: "SECP256K1",
    custody: "self-custodial",
  },
  smartAccount: {
    chainId: 1,
    factory: "0xfactory",
    implementation: "0ximplementation",
    index: 0,
    validator: "0xvalidator",
    validatorType: "ECDSA",
    version: "0.3.1",
  },
  hasPasskey: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  modifiedAt: "2026-01-01T00:00:00.000Z",
} satisfies ViewerWallet;

describe("UserProfileMenu", () => {
  it("opens a compact profile and closes it with Escape", () => {
    render(<UserProfileMenu wallet={wallet} />);
    const trigger = screen.getByRole("button", { name: "Open user profile" });

    expect(screen.getByText("0x12....f45")).toBeTruthy();
    fireEvent.click(trigger);

    expect(screen.getByRole("region", { name: "User profile" })).toBeTruthy();
    expect(screen.getAllByText("ww")).toHaveLength(2);
    expect(screen.getByText("ww@example.com")).toBeTruthy();
    expect(screen.getByText("SECP256K1")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Manage profile" }).getAttribute("href"),
    ).toBe("/settings");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
