import "server-only";

import type { Metadata } from "next";
import {
  evaluateHostConfiguration,
  type HostConfigurationInput,
  type HostConfigurationState,
  type WalletHostConfiguration,
} from "@/api/host-configuration";
import { hostTokenCss, type HostPresentation } from "@/app/_domain/wallet-host";

/**
 * The branded wallet host this deployment serves, from its environment only:
 * WALLET_HOST_CONFIGURATION and its pin WALLET_HOST_CONFIGURATION_SHA256,
 * checked against NEXT_PUBLIC_APP_URL, PRODUCT_FACE_APPLICATIONS and the
 * configuration the build rendered (WALLET_HOST_BUILD_CONFIGURATION_SHA256,
 * recorded by next.config.ts). Absent: the generic wallet, unchanged.
 * Invalid: every page and BFF route fails closed (see proxy.ts).
 */
let cached:
  { input: HostConfigurationInput; state: HostConfigurationState } | undefined;
let reported: string | undefined;

function currentInput(): HostConfigurationInput {
  return {
    raw: process.env.WALLET_HOST_CONFIGURATION,
    pin: process.env.WALLET_HOST_CONFIGURATION_SHA256,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    faceApplications: process.env.PRODUCT_FACE_APPLICATIONS,
    production: process.env.NODE_ENV === "production",
    buildSha256: process.env.WALLET_HOST_BUILD_CONFIGURATION_SHA256,
  };
}

function sameInput(a: HostConfigurationInput, b: HostConfigurationInput) {
  return (
    a.raw === b.raw &&
    a.pin === b.pin &&
    a.appUrl === b.appUrl &&
    a.faceApplications === b.faceApplications &&
    a.production === b.production &&
    a.buildSha256 === b.buildSha256
  );
}

export function walletHost(): HostConfigurationState {
  const input = currentInput();
  if (cached && sameInput(cached.input, input)) return cached.state;
  const state = evaluateHostConfiguration(input);
  cached = { input, state };
  if (state.status === "invalid") {
    // The operator log names the problem, never the configuration's content.
    const problem = `${state.problem}:${state.configurationSha256 ?? ""}`;
    if (problem !== reported) {
      reported = problem;
      console.error(
        `WALLET_HOST_CONFIGURATION is not usable (${state.problem}); this wallet answers 503 until it is fixed.`,
      );
    }
  }
  return state;
}

/** The active configuration, or undefined (absent or invalid). */
export function activeHostConfiguration(): WalletHostConfiguration | undefined {
  const host = walletHost();
  return host.status === "active" ? host.configuration : undefined;
}

export const HOST_LOGO_ROUTE = "/api/host/logo";

/** The content-addressed logo URL: a new logo is a new URL. */
export function hostLogoSrc(configuration: WalletHostConfiguration) {
  return `${HOST_LOGO_ROUTE}/${configuration.identity.logo.sha256}`;
}

/** The pinned logo, only for its own sha256. */
export function hostLogo(sha256: string) {
  const host = walletHost();
  if (host.status !== "active") return undefined;
  const { logo } = host.configuration.identity;
  if (sha256 !== logo.sha256) return undefined;
  return { bytes: host.logo, mediaType: logo.mediaType, sha256: logo.sha256 };
}

/** What the browser shell may know: presentation only, no secret exists. */
export function hostPresentation(): HostPresentation | null {
  const configuration = activeHostConfiguration();
  if (!configuration) return null;
  const { brand, home, navigation, journeys } = configuration;
  return {
    brand: { id: brand.id, name: brand.name, shortName: brand.shortName },
    logo: { src: hostLogoSrc(configuration) },
    navigation: [...navigation],
    home: { headline: home.headline, introduction: home.introduction },
    journeys: { ...journeys },
  };
}

/** The host stylesheet: validated tokens and the bundled family only. */
export function hostStyle() {
  const configuration = activeHostConfiguration();
  if (!configuration) return undefined;
  const { colours, typography } = configuration.identity;
  return hostTokenCss(colours, typography.family);
}

/** The document metadata of the active host: name, description, icons. */
export function hostMetadata(): Metadata | undefined {
  const configuration = activeHostConfiguration();
  if (!configuration) return undefined;
  const { brand, entrance, identity } = configuration;
  const logo = hostLogoSrc(configuration);
  return {
    metadataBase: new URL(entrance.origin),
    title: { default: brand.name, template: `%s · ${brand.name}` },
    description: brand.description,
    applicationName: brand.shortName,
    appleWebApp: { title: brand.shortName },
    icons: {
      icon: [{ url: logo, type: identity.logo.mediaType }],
      shortcut: [logo],
      apple: [logo],
    },
    openGraph: {
      title: brand.name,
      description: brand.description,
      siteName: brand.name,
      images: [{ url: logo }],
    },
    twitter: { card: "summary", images: [logo] },
    robots: { index: false, follow: false },
  };
}

/** Test seam: forget the cached evaluation and the reported problem. */
export function resetWalletHostCache() {
  cached = undefined;
  reported = undefined;
}
