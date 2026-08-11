import {
  DEFAULT_ORGANIZATION_ID,
  organizationIdForSubdomain,
  organizationIdFromHost,
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
      organizationIdFromHost(
        "customer.example.com",
        "wallet.dual.network",
      ),
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
