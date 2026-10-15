/**
 * @jest-environment node
 */
// The root document of the same build, by environment alone: the generic
// wallet's (absent configuration) is unchanged; a brand host's carries its
// validated tokens, family and identity; an invalid one is the neutral notice.
import { renderToStaticMarkup } from "react-dom/server";
import { resetWalletHostCache } from "@/api/wallet-host";
import { hostFontFamilies } from "@/app/_domain/wallet-host";
import RootLayout, { generateMetadata } from "@/app/layout";
import {
  applyHostEnvironment,
  clearHostEnvironment,
  hostEnvironment,
  morrowDocument,
  tidewellDocument,
} from "@/test/wallet-host-fixtures";

jest.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock("next-intl/server", () => ({
  getMessages: async () => ({}),
  getTranslations: async (namespace: string) =>
    jest.requireActual("@/test/intl-mock").translations(namespace),
}));

const THEME_SCRIPT = `try{var t=localStorage.getItem("viewer-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.classList.toggle("dark",t==="dark")}catch(e){}`;

async function documentFor(
  environment: Parameters<typeof applyHostEnvironment>[0],
) {
  resetWalletHostCache();
  applyHostEnvironment(environment);
  return renderToStaticMarkup(
    await RootLayout({ children: <main>page</main> }),
  );
}

afterEach(() => {
  clearHostEnvironment();
  resetWalletHostCache();
});

describe("the generic wallet (no host configuration)", () => {
  it("renders exactly the document it always has", async () => {
    const html = await documentFor({
      NEXT_PUBLIC_APP_URL: "http://demo.localhost:3000",
      WALLET_HOST_BUILD_CONFIGURATION_SHA256: "",
    });
    expect(html).toBe(
      `<html lang="en"><head><script>${THEME_SCRIPT}</script></head><body><main>page</main></body></html>`,
    );
  });

  it("keeps its metadata", async () => {
    applyHostEnvironment({ NEXT_PUBLIC_APP_URL: "http://demo.localhost:3000" });
    expect(await generateMetadata()).toEqual({
      metadataBase: new URL("http://demo.localhost:3000"),
      title: { default: "Dual Wallet", template: "%s · Dual Wallet" },
      description: "Your secure smart object inventory and wallet activity.",
      icons: {
        icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
        shortcut: ["/favicon.svg"],
      },
      openGraph: {
        title: "Dual Wallet",
        description: "Your secure smart object inventory and wallet activity.",
        images: [{ url: "/og-viewer.png", width: 1745, height: 909 }],
      },
      twitter: { card: "summary_large_image", images: ["/og-viewer.png"] },
      robots: { index: false, follow: false },
    });
  });
});

describe("two brand hosts from one build", () => {
  it("render visibly different documents, tokens and families only", async () => {
    const morrow = await documentFor(hostEnvironment(morrowDocument()));
    const tidewell = await documentFor(hostEnvironment(tidewellDocument()));
    expect(morrow).toContain('<html lang="en" data-wallet-host="morrow-home">');
    expect(tidewell).toContain('<html lang="en" data-wallet-host="tidewell">');
    expect(morrow).toContain("--brand:#2f7d5b");
    expect(tidewell).toContain("--brand:#3b5bdb");
    expect(morrow).toContain(`font-family:${hostFontFamilies.satoshi}`);
    expect(tidewell).toContain(
      `font-family:${hostFontFamilies["system-serif"]}`,
    );
    for (const html of [morrow, tidewell]) {
      // One validated palette: no theme script; nothing else injected.
      expect(html).not.toContain("viewer-theme");
      expect(html.match(/<style>/g)).toHaveLength(1);
      expect(html).not.toMatch(/<script|url\(/);
    }
    expect(morrow).not.toBe(tidewell);
  });

  it("title the document after each brand", async () => {
    applyHostEnvironment(hostEnvironment(morrowDocument()));
    expect((await generateMetadata()).title).toEqual({
      default: "Morrow Home",
      template: "%s · Morrow Home",
    });
    resetWalletHostCache();
    applyHostEnvironment(hostEnvironment(tidewellDocument()));
    expect((await generateMetadata()).title).toEqual({
      default: "Tidewell",
      template: "%s · Tidewell",
    });
  });
});

describe("an invalid host configuration", () => {
  it("renders only the neutral notice", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const html = await documentFor({
      ...hostEnvironment(morrowDocument()),
      WALLET_HOST_CONFIGURATION_SHA256: "7".repeat(64),
    });
    expect(html).toContain("This wallet is being set up");
    expect(html).not.toMatch(/page|Morrow|Dual|data-wallet-host="/);
    expect(await generateMetadata()).toEqual({
      title: "This wallet is being set up",
      robots: { index: false, follow: false },
    });
    consoleError.mockRestore();
  });
});
