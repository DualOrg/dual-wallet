import { fireEvent, render, screen } from "@testing-library/react";
import { AppShell } from "@/app/_components/app-shell";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      inventory: "Inventory",
      activity: "Activity",
      settings: "Settings",
      logout: "Log out",
      mainNavigation: "Main navigation",
      theme: "Change color theme",
      openMenu: "Open navigation",
      closeMenu: "Close navigation",
      skipToContent: "Skip to main content",
    })[key] ?? key,
}));
jest.mock("next/navigation", () => ({
  usePathname: () => "/inventory",
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
}));
jest.mock("@/app/_providers/session-provider", () => ({
  useSession: () => ({
    wallet: null,
    isLoading: false,
    isAuthenticated: true,
    logout: jest.fn(),
  }),
}));
jest.mock("@/app/_providers/theme-provider", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: jest.fn() }),
}));

const menu = () => screen.getByRole("button", { name: /navigation/ });

describe("AppShell", () => {
  it("offers a skip link to the main content", () => {
    render(<AppShell>content</AppShell>);
    const skip = screen.getByRole("link", { name: "Skip to main content" });
    expect(skip.getAttribute("href")).toBe("#main-content");
    expect(document.getElementById("main-content")).toBeTruthy();
  });

  it("reports the mobile menu state in its name and aria-expanded", () => {
    render(<AppShell>content</AppShell>);
    expect(menu().getAttribute("aria-expanded")).toBe("false");
    expect(menu().getAttribute("aria-label")).toBe("Open navigation");

    fireEvent.click(menu());
    expect(menu().getAttribute("aria-expanded")).toBe("true");
    expect(menu().getAttribute("aria-label")).toBe("Close navigation");
    expect(
      document.getElementById(menu().getAttribute("aria-controls") ?? ""),
    ).toBeTruthy();
  });

  it("closes the mobile menu on Escape and returns focus to the trigger", () => {
    render(<AppShell>content</AppShell>);
    fireEvent.click(menu());
    fireEvent.keyDown(document, { key: "Escape" });

    expect(menu().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(menu());
  });
});
