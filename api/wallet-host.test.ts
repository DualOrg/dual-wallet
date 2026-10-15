/**
 * @jest-environment node
 */
import { createHash } from "node:crypto";
import {
  hostLogo,
  hostMetadata,
  hostPresentation,
  hostStyle,
  resetWalletHostCache,
  walletHost,
} from "@/api/wallet-host";
import { GET as logoGET } from "@/app/api/host/logo/[sha256]/route";
import { hostFontFamilies } from "@/app/_domain/wallet-host";
import {
  applyHostEnvironment,
  clearHostEnvironment,
  hostEnvironment,
  MORROW_LOGO_BASE64,
  MORROW_ORIGIN,
  morrowDocument,
  TIDEWELL_LOGO_BASE64,
  tidewellDocument,
} from "@/test/wallet-host-fixtures";

const sha256 = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
const MORROW_LOGO = Buffer.from(MORROW_LOGO_BASE64, "base64");
const TIDEWELL_LOGO = Buffer.from(TIDEWELL_LOGO_BASE64, "base64");

let consoleError: jest.SpyInstance;
beforeEach(() => {
  resetWalletHostCache();
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  clearHostEnvironment();
  consoleError.mockRestore();
});

const logo = (hash: string) =>
  logoGET(new Request(`https://wallet.example/api/host/logo/${hash}`), {
    params: Promise.resolve({ sha256: hash }),
  });

describe("without a host configuration (the generic wallet)", () => {
  it("is absent and changes nothing", async () => {
    applyHostEnvironment({ NEXT_PUBLIC_APP_URL: "http://demo.localhost:3000" });
    expect(walletHost()).toEqual({ status: "absent" });
    expect(hostPresentation()).toBeNull();
    expect(hostStyle()).toBeUndefined();
    expect(hostMetadata()).toBeUndefined();
    expect((await logo(sha256(MORROW_LOGO))).status).toBe(404);
  });
});

describe("two brand hosts from one build", () => {
  it("present different names, logos, navigation and home copy", () => {
    applyHostEnvironment(hostEnvironment(morrowDocument()));
    const morrow = hostPresentation();
    resetWalletHostCache();
    applyHostEnvironment(hostEnvironment(tidewellDocument()));
    const tidewell = hostPresentation();

    expect(morrow).toEqual({
      brand: { id: "morrow-home", name: "Morrow Home", shortName: "Morrow" },
      logo: { src: `/api/host/logo/${sha256(MORROW_LOGO)}` },
      navigation: ["inventory", "products", "activity", "settings"],
      home: {
        headline: "Your Morrow Home tools, registered and cared for.",
        introduction:
          "Register a new tool, follow a service and pass it on when you sell it.",
      },
      journeys: {
        registration: true,
        myProducts: true,
        serviceProgress: true,
        quoteDecisions: true,
        transfer: true,
      },
    });
    expect(tidewell).toEqual({
      brand: { id: "tidewell", name: "Tidewell", shortName: "Tidewell" },
      logo: { src: `/api/host/logo/${sha256(TIDEWELL_LOGO)}` },
      navigation: ["products", "settings"],
      home: {
        headline: "Every Tidewell kettle you own, in one place.",
        introduction: "See your registered kettles and register a new one.",
      },
      journeys: {
        registration: true,
        myProducts: true,
        serviceProgress: false,
        quoteDecisions: false,
        transfer: false,
      },
    });
  });

  it("render different tokens and families, and nothing else", () => {
    applyHostEnvironment(hostEnvironment(morrowDocument()));
    const morrow = hostStyle()!;
    resetWalletHostCache();
    applyHostEnvironment(hostEnvironment(tidewellDocument()));
    const tidewell = hostStyle()!;

    expect(morrow).toContain("--brand:#2f7d5b;");
    expect(morrow).toContain("--action-primary:#1d5c41;");
    expect(morrow).toContain(`font-family:${hostFontFamilies.satoshi}`);
    expect(tidewell).toContain("--brand:#3b5bdb;");
    expect(tidewell).toContain("--surface:#fffdf8;");
    expect(tidewell).toContain(
      `font-family:${hostFontFamilies["system-serif"]}`,
    );
    for (const style of [morrow, tidewell]) {
      // Tokens and one family only: no url(), import, markup or extra rule.
      expect(style).not.toMatch(/url\(|@import|<|expression/i);
      expect(style.match(/\{/g)).toHaveLength(2);
    }
  });

  it("name the document after the brand, with the pinned logo as its icon", () => {
    applyHostEnvironment(hostEnvironment(tidewellDocument()));
    const src = `/api/host/logo/${sha256(TIDEWELL_LOGO)}`;
    expect(hostMetadata()).toEqual({
      metadataBase: new URL("https://wallet.tidewell.example"),
      title: { default: "Tidewell", template: "%s · Tidewell" },
      description: "Your Tidewell kettles and their registrations.",
      applicationName: "Tidewell",
      appleWebApp: { title: "Tidewell" },
      icons: {
        icon: [{ url: src, type: "image/webp" }],
        shortcut: [src],
        apple: [src],
      },
      openGraph: {
        title: "Tidewell",
        description: "Your Tidewell kettles and their registrations.",
        siteName: "Tidewell",
        images: [{ url: src }],
      },
      twitter: { card: "summary", images: [src] },
      robots: { index: false, follow: false },
    });
  });

  it("serve exactly each host's pinned logo bytes, immutable by hash", async () => {
    for (const [document, bytes, type] of [
      [morrowDocument(), MORROW_LOGO, "image/png"],
      [tidewellDocument(), TIDEWELL_LOGO, "image/webp"],
    ] as const) {
      resetWalletHostCache();
      applyHostEnvironment(hostEnvironment(document));
      const response = await logo(sha256(bytes));
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
      expect(response.headers.get("content-type")).toBe(type);
      expect(response.headers.get("content-length")).toBe(String(bytes.length));
      expect(response.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable",
      );
      expect(response.headers.get("etag")).toBe(`"${sha256(bytes)}"`);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    }
    // Another host's logo hash, or any other value, is not this host's.
    expect((await logo(sha256(MORROW_LOGO))).status).toBe(404);
    expect((await logo("../favicon.svg")).status).toBe(404);
    expect(hostLogo(sha256(MORROW_LOGO))).toBeUndefined();
  });

  it("serve no logo and no identity while the configuration is invalid", async () => {
    applyHostEnvironment({
      ...hostEnvironment(morrowDocument()),
      WALLET_HOST_CONFIGURATION_SHA256: "0".repeat(64),
    });
    expect(walletHost()).toMatchObject({
      status: "invalid",
      problem: "pin_mismatch",
    });
    const response = await logo(sha256(MORROW_LOGO));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(hostPresentation()).toBeNull();
    expect(hostStyle()).toBeUndefined();
    expect(hostMetadata()).toBeUndefined();
    // The operator log names the problem, never the configuration.
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(String(consoleError.mock.calls[0][0])).toContain("pin_mismatch");
    expect(String(consoleError.mock.calls[0][0])).not.toContain("Morrow");
  });

  it("keeps the entrance origin as the metadata base", () => {
    applyHostEnvironment(hostEnvironment(morrowDocument()));
    expect(hostMetadata()?.metadataBase).toEqual(new URL(MORROW_ORIGIN));
  });
});
