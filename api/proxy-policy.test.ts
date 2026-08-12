import { validateProxyPath } from "@/api/proxy-policy";

describe("validateProxyPath", () => {
  it("allows only Viewer read models and current-wallet settings", () => {
    expect(validateProxyPath("GET", ["objects"]).allowed).toBe(true);
    expect(validateProxyPath("GET", ["objects", "object-1"]).allowed).toBe(
      true,
    );
    expect(
      validateProxyPath("GET", ["objects", "object-1", "attributes"]).allowed,
    ).toBe(true);
    expect(validateProxyPath("GET", ["ebus", "action-logs"]).allowed).toBe(
      true,
    );
    expect(validateProxyPath("PATCH", ["wallets", "me"]).allowed).toBe(true);
  });

  it("keeps credential and private endpoints out of the generic proxy", () => {
    expect(validateProxyPath("POST", ["auth", "login"]).allowed).toBe(false);
    expect(
      validateProxyPath("POST", ["wallets", "connect", "eoa"]).allowed,
    ).toBe(false);
    expect(validateProxyPath("GET", ["pwallet"]).allowed).toBe(false);
    expect(validateProxyPath("GET", ["..", "objects"]).allowed).toBe(false);
  });

  it("allows only the action mutation routes used by the Viewer", () => {
    expect(validateProxyPath("POST", ["ebus", "prepare"]).allowed).toBe(true);
    expect(validateProxyPath("POST", ["ebus", "execute"]).allowed).toBe(true);
    expect(validateProxyPath("POST", ["ebus", "action-logs"]).allowed).toBe(
      false,
    );
  });
});
