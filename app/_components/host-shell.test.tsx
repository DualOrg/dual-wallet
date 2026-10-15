import { render, screen, within } from "@testing-library/react";
import { AppShell } from "@/app/_components/app-shell";
import { AuthShell } from "@/app/_components/auth/auth-shell";
import { Brand } from "@/app/_components/design-system/brand";
import type { HostPresentation } from "@/app/_domain/wallet-host";
import { HostProvider } from "@/app/_providers/host-provider";

jest.mock("next-intl", () => jest.requireActual("@/test/intl-mock").intlMock);
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

const journeys = {
  registration: true,
  myProducts: true,
  serviceProgress: true,
  quoteDecisions: true,
  transfer: true,
};

// The presentations api/wallet-host.ts hands the shells for the two fixture
// hosts (test/wallet-host-fixtures.ts); asserted there from the real parser.
const MORROW: HostPresentation = {
  brand: { id: "morrow-home", name: "Morrow Home", shortName: "Morrow" },
  logo: {
    src: "/api/host/logo/282cba7d64bef7fcb707356817857ea89806365383c02e6922b7e26e3357c6b7",
  },
  navigation: ["inventory", "products", "activity", "settings"],
  home: {
    headline: "Your Morrow Home tools, registered and cared for.",
    introduction:
      "Register a new tool, follow a service and pass it on when you sell it.",
  },
  journeys,
};
const TIDEWELL: HostPresentation = {
  brand: { id: "tidewell", name: "Tidewell", shortName: "Tidewell" },
  logo: {
    src: "/api/host/logo/86be52bdb7547413cafb3ed175a806a798c65de98b40849e0b974c47d187de65",
  },
  navigation: ["products", "settings"],
  home: {
    headline: "Every Tidewell kettle you own, in one place.",
    introduction: "See your registered kettles and register a new one.",
  },
  journeys: {
    ...journeys,
    serviceProgress: false,
    quoteDecisions: false,
    transfer: false,
  },
};

const shell = (host: HostPresentation | null) =>
  render(
    <HostProvider host={host}>
      <AppShell>content</AppShell>
    </HostProvider>,
  );

describe("Brand", () => {
  it("is the generic wallet's without a host", () => {
    const { container } = render(<Brand />);
    expect(container.textContent).toBe("Dual Wallet");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/favicon.svg",
    );
  });

  it("is the host's name and pinned logo with one", () => {
    const { container } = render(<Brand host={MORROW} />);
    expect(container.textContent).toBe("Morrow Home");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      MORROW.logo.src,
    );
  });
});

describe("AuthShell", () => {
  it("tells the host's own story", () => {
    render(<AuthShell host={TIDEWELL}>form</AuthShell>);
    expect(screen.getByText("Tidewell")).toBeTruthy();
    expect(screen.getByText(TIDEWELL.home.headline)).toBeTruthy();
    expect(screen.getByText(TIDEWELL.home.introduction)).toBeTruthy();
    expect(screen.queryByText("Dual Wallet")).toBeNull();
  });

  it("is unchanged without a host", () => {
    render(<AuthShell>form</AuthShell>);
    expect(screen.getByText("Dual Wallet")).toBeTruthy();
    expect(
      screen.getByText("Everything you own, in one trusted place."),
    ).toBeTruthy();
  });
});

describe("AppShell identity", () => {
  it("shows the host's brand and no theme switch", () => {
    shell(MORROW);
    const sidebar = document.querySelector("aside")!;
    expect(
      within(sidebar as HTMLElement).getByText("Morrow Home"),
    ).toBeTruthy();
    expect(screen.queryByText("Dual Wallet")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Change color theme" }),
    ).toBeNull();
  });

  it("keeps the generic brand and theme switch without a host", () => {
    shell(null);
    expect(screen.getAllByText("Dual Wallet")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Change color theme" }),
    ).toBeTruthy();
  });
});
