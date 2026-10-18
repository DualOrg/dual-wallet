/**
 * @jest-environment node
 */
// The programme list and the task pages repeat, on the server, the page
// check the request proxy makes for a branded host.
import { renderToStaticMarkup } from "react-dom/server";
import ProductTaskPage from "@/app/(authorized)/products/[slug]/[[...task]]/page";
import ProductsPage from "@/app/(authorized)/products/page";
import { resetWalletHostCache } from "@/api/wallet-host";
import { edit } from "@/test/product-face-fixtures";
import {
  applyHostEnvironment,
  clearHostEnvironment,
  hostEnvironment,
  registryWithBothFaces,
  tidewellDocument,
} from "@/test/wallet-host-fixtures";

jest.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
}));
jest.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    jest.requireActual("@/test/intl-mock").translations(namespace),
}));

afterEach(() => {
  clearHostEnvironment();
  resetWalletHostCache();
});

function host(
  configure?: (document: ReturnType<typeof tidewellDocument>) => void,
) {
  const document = tidewellDocument();
  configure?.(document);
  resetWalletHostCache();
  applyHostEnvironment(hostEnvironment(document));
}

const task = (slug: string, segments?: string[]) =>
  ProductTaskPage({ params: Promise.resolve({ slug, task: segments }) });

describe("the programme list", () => {
  it("is not found on a host without the My products journey", async () => {
    host((document) => {
      edit(document, "journeys.myProducts", false);
      edit(document, "navigation", ["settings"]);
      edit(document, "home.primaryJourney", "registration");
    });
    await expect(ProductsPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("lists only the host's own faces", async () => {
    host();
    const html = renderToStaticMarkup(await ProductsPage());
    expect(html).toContain("Tidewell Kettle");
    expect(html).not.toContain("Morrow Home Arc");
  });

  it("lists every registry face for the generic wallet", async () => {
    applyHostEnvironment({
      PRODUCT_FACE_APPLICATIONS: registryWithBothFaces(),
    });
    const html = renderToStaticMarkup(await ProductsPage());
    expect(html).toContain("Tidewell Kettle");
    expect(html).toContain("Morrow Home Arc");
  });
});

describe("a face task page", () => {
  it("is not found for a disabled journey's task or a non-contract route", async () => {
    host();
    await expect(task("tidewell-care", ["service"])).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    await expect(task("tidewell-care", ["accept"])).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    await expect(task("tidewell-care", ["claims"])).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(await task("tidewell-care", ["register"])).toBeNull();
    expect(await task("tidewell-care")).toBeNull();
    // An invalid task path still goes back to the programme entry.
    await expect(task("tidewell-care", ["Bad Path"])).rejects.toThrow(
      "NEXT_REDIRECT /products/tidewell-care",
    );
  });

  it("serves every task for the generic wallet", async () => {
    applyHostEnvironment({
      PRODUCT_FACE_APPLICATIONS: registryWithBothFaces(),
    });
    expect(await task("tidewell-care", ["service"])).toBeNull();
    expect(await task("morrow-home", ["claims"])).toBeNull();
  });
});
