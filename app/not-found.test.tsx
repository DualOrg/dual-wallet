/**
 * @jest-environment node
 */
// The not-found page outside the signed-in shell: on a branded host it is the
// host's own (its name and logo; the root layout supplies its tokens), never
// another brand's and never Next's stock page; the generic wallet keeps its
// own mark. Every page a branded host refuses is rewritten here.
import { renderToStaticMarkup } from "react-dom/server";
import { resetWalletHostCache } from "@/api/wallet-host";
import NotFound from "@/app/not-found";
import {
  applyHostEnvironment,
  clearHostEnvironment,
  hostEnvironment,
  morrowDocument,
  tidewellDocument,
} from "@/test/wallet-host-fixtures";

jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) =>
    jest.requireActual("@/test/intl-mock").translations(namespace),
}));
jest.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    jest.requireActual("@/test/intl-mock").translations(namespace),
}));
jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    className,
    children,
  }: {
    href: string;
    className?: string;
    children: React.ReactNode;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

async function pageFor(
  environment: Parameters<typeof applyHostEnvironment>[0],
) {
  resetWalletHostCache();
  applyHostEnvironment(environment);
  return renderToStaticMarkup(await NotFound());
}

afterEach(() => {
  clearHostEnvironment();
  resetWalletHostCache();
});

describe("the not-found page", () => {
  it("is each brand host's own: its name and pinned logo, a way back to its home", async () => {
    const morrow = await pageFor(hostEnvironment(morrowDocument()));
    const tidewell = await pageFor(hostEnvironment(tidewellDocument()));
    expect(morrow).toContain("Morrow Home");
    expect(morrow).toMatch(/src="\/api\/host\/logo\/[0-9a-f]{64}"/);
    expect(morrow).not.toContain("Tidewell");
    expect(tidewell).toContain("Tidewell");
    expect(tidewell).not.toContain("Morrow");
    for (const html of [morrow, tidewell]) {
      expect(html).toContain("<h1");
      expect(html).toContain("Page not found");
      expect(html).toContain('href="/"');
      expect(html).not.toContain("/favicon.svg");
      expect(html).not.toContain("This page could not be found");
    }
  });

  it("keeps the generic wallet's own mark and lands it on the inventory", async () => {
    const html = await pageFor({
      NEXT_PUBLIC_APP_URL: "http://demo.localhost:3000",
    });
    expect(html).toContain("/favicon.svg");
    expect(html).toContain("Page not found");
    expect(html).toContain('href="/inventory"');
    expect(html).not.toContain("/api/host/logo/");
  });
});
