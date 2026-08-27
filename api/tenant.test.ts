/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import {
  DEFAULT_ORGANIZATION_ID,
  organizationIdForSubdomain,
  organizationIdFromHost,
  tenantFromRequest,
} from "@/api/tenant";

describe("organizationIdFromHost", () => {
  it("resolves tenant labels through the wildcard organization mapping", () => {
    expect(
      organizationIdFromHost(
        "acme.wallet.dual.network:443",
        "wallet.dual.network",
      ),
    ).toEqual({
      organizationId: DEFAULT_ORGANIZATION_ID,
      subdomain: "acme",
      host: "acme.wallet.dual.network",
    });
  });

  it("supports tenant.localhost during development", () => {
    expect(
      organizationIdFromHost("demo.localhost:3000", "wallet.dual.network"),
    ).toEqual({
      organizationId: DEFAULT_ORGANIZATION_ID,
      subdomain: "demo",
      host: "demo.localhost",
    });
  });

  it("uses the wildcard organization when the subdomain is empty", () => {
    expect(organizationIdFromHost("localhost:3000")).toEqual({
      organizationId: DEFAULT_ORGANIZATION_ID,
      subdomain: "*",
      host: "localhost",
    });
    expect(
      organizationIdFromHost("wallet.dual.network", "wallet.dual.network"),
    ).toEqual({
      organizationId: DEFAULT_ORGANIZATION_ID,
      subdomain: "*",
      host: "wallet.dual.network",
    });
    expect(organizationIdForSubdomain()).toBe(DEFAULT_ORGANIZATION_ID);
  });

  it("uses the wildcard organization outside the configured Viewer domain", () => {
    expect(
      organizationIdFromHost("example.com", "wallet.dual.network"),
    ).toEqual({
      organizationId: DEFAULT_ORGANIZATION_ID,
      subdomain: "*",
      host: "example.com",
    });
    expect(
      organizationIdFromHost("customer.example.com", "wallet.dual.network"),
    ).toEqual({
      organizationId: DEFAULT_ORGANIZATION_ID,
      subdomain: "customer",
      host: "customer.example.com",
    });
  });

  it("still rejects malformed host headers", () => {
    expect(
      organizationIdFromHost("https://example.com", "wallet.dual.network"),
    ).toBeUndefined();
    expect(
      organizationIdFromHost("bad_host.example.com", "wallet.dual.network"),
    ).toBeUndefined();
  });
});

describe("tenantFromRequest", () => {
  const CHOSEN = "5f2b1c4e8a9d0b3c7e6f1a24";

  function request(cookie?: string, forwardedHost?: string) {
    const headers: Record<string, string> = {};
    if (cookie) headers.cookie = cookie;
    if (forwardedHost) headers["x-forwarded-host"] = forwardedHost;
    return new NextRequest("http://localhost/api/session/login", { headers });
  }

  it("prefers the organization the entry link left in the cookie", () => {
    expect(
      tenantFromRequest(request(`smarttoken_viewer_org=${CHOSEN}`)),
    ).toEqual({
      organizationId: CHOSEN,
      subdomain: "*",
      host: "localhost",
    });
  });

  it("falls back to the host when no entry link chose one", () => {
    expect(tenantFromRequest(request())).toEqual({
      organizationId: DEFAULT_ORGANIZATION_ID,
      subdomain: "*",
      host: "localhost",
    });
  });

  it("ignores a cookie that is not an organization ID", () => {
    for (const value of ["", "not-an-organization", "6a1889", `${CHOSEN}0`]) {
      expect(
        tenantFromRequest(request(`smarttoken_viewer_org=${value}`))
          ?.organizationId,
      ).toBe(DEFAULT_ORGANIZATION_ID);
    }
  });

  it("still rejects a malformed host, chosen organization or not", () => {
    expect(
      tenantFromRequest(
        request(`smarttoken_viewer_org=${CHOSEN}`, "bad_host.example.com"),
      ),
    ).toBeUndefined();
  });
});

// The production failure: with DEFAULT_ORGANIZATION_ID unset, every request was
// rejected, including the entry link that names its own organization.
describe("without a default organization", () => {
  const CHOSEN = "6a188923d5a314400c196005";

  async function isolatedTenant() {
    jest.resetModules();
    process.env.DEFAULT_ORGANIZATION_ID = "";
    return import("@/api/tenant");
  }

  afterEach(() => {
    process.env.DEFAULT_ORGANIZATION_ID = DEFAULT_ORGANIZATION_ID;
    jest.resetModules();
  });

  it("resolves the organization an entry link chose", async () => {
    const { tenantFromRequest: resolve } = await isolatedTenant();
    expect(
      resolve(
        new NextRequest("http://localhost/api/session/login", {
          headers: { cookie: `smarttoken_viewer_org=${CHOSEN}` },
        }),
      ),
    ).toEqual({ organizationId: CHOSEN, subdomain: "*", host: "localhost" });
  });

  it("still rejects a request that named no organization", async () => {
    const { tenantFromRequest: resolve } = await isolatedTenant();
    expect(
      resolve(new NextRequest("http://localhost/api/session/login")),
    ).toBeUndefined();
  });
});
