import { apiBaseUrl, resolvePlatform, sandboxApiUrl } from "@/api/platform";

const SANDBOX = "https://api-sandbox.example.test";

afterEach(() => {
  delete process.env.API_URL;
  delete process.env.SANDBOX_API_URL;
});

describe("sandboxApiUrl", () => {
  it("accepts a distinct HTTP(S) origin and drops trailing slashes", () => {
    expect(sandboxApiUrl(`${SANDBOX}/`)).toBe(SANDBOX);
  });

  it("rejects missing, malformed and unsafe values", () => {
    for (const value of [
      undefined,
      "",
      " ",
      "not a url",
      "ftp://api-sandbox.example.test",
      "https://user:pass@api-sandbox.example.test",
      `${SANDBOX}?x=1`,
      `${SANDBOX}#x`,
      "https://api.dual.network",
    ]) {
      expect(sandboxApiUrl(value)).toBeUndefined();
    }
  });

  it("rejects the configured production origin", () => {
    process.env.API_URL = SANDBOX;
    expect(sandboxApiUrl(SANDBOX)).toBeUndefined();
  });
});

describe("resolvePlatform", () => {
  it("selects sandbox only when the sandbox gateway is configured", () => {
    expect(resolvePlatform("sandbox")).toBe("production");
    process.env.SANDBOX_API_URL = SANDBOX;
    expect(resolvePlatform("sandbox")).toBe("sandbox");
    expect(resolvePlatform("production")).toBe("production");
    expect(resolvePlatform("other")).toBe("production");
    expect(resolvePlatform(undefined)).toBe("production");
  });
});

describe("apiBaseUrl", () => {
  beforeEach(() => {
    process.env.API_URL = "https://api.example.test/";
    process.env.SANDBOX_API_URL = SANDBOX;
  });

  it("sends objects, actions and displays to the sandbox gateway", () => {
    for (const path of [
      "objects",
      "objects/object-1/attributes",
      "/ebus/execute",
      "ebus/action-logs",
      "/public/objects/object-1/display/card",
    ]) {
      expect(apiBaseUrl(path, "sandbox")).toBe(SANDBOX);
    }
  });

  it("keeps shared account routes and production on production", () => {
    for (const path of [
      "wallets/me",
      "auth/verification-code",
      "public/organizations/org-1/branding",
      "objectsx",
    ]) {
      expect(apiBaseUrl(path, "sandbox")).toBe("https://api.example.test");
    }
    expect(apiBaseUrl("objects", "production")).toBe(
      "https://api.example.test",
    );
  });

  it("falls back to production when the sandbox gateway is not configured", () => {
    delete process.env.SANDBOX_API_URL;
    expect(apiBaseUrl("objects", "sandbox")).toBe("https://api.example.test");
  });
});
