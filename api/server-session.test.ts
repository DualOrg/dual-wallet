/**
 * @jest-environment node
 */
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_ORGANIZATION_ID } from "@/api/tenant";
import { ResponseError } from "@/api/web-sdk/runtime";

const refreshToken = jest.fn();
const logout = jest.fn();
jest.mock("@/api/web-sdk-client", () => ({
  getWalletsApi: () => ({ refreshToken, logout }),
}));

import {
  activeSession,
  establishSession,
  readSession,
  revokeSession,
  sealForPurpose,
} from "@/api/server-session";
import type { LoginOut } from "@/api/web-sdk/models/LoginOut";

function jwt(claims: Record<string, unknown>, padding = 0) {
  const payload = Buffer.from(
    JSON.stringify({ ...claims, pad: "x".repeat(padding) }),
  ).toString("base64url");
  return `header.${payload}.signature`;
}

const tenant = {
  organizationId: DEFAULT_ORGANIZATION_ID,
  subdomain: "*",
  host: "localhost",
};

function login(padding = 0) {
  return {
    // Already expired, so every call exercises the renewal path.
    accessToken: jwt(
      {
        org_id: DEFAULT_ORGANIZATION_ID,
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      padding,
    ),
    refreshToken: jwt({ exp: Math.floor(Date.now() / 1000) + 900 }, padding),
    wallet: {
      account: { controller: {}, smartAccount: {} },
      emailVerified: true,
      whenCreated: new Date(),
      whenModified: new Date(),
    },
  } as unknown as LoginOut;
}

function signInResponse(padding = 0, persistent = false) {
  const response = NextResponse.json({});
  expect(
    establishSession(response, login(padding), tenant, "email", persistent),
  ).toBe(true);
  return response;
}

function signIn(padding = 0, persistent = false) {
  return signInResponse(padding, persistent).cookies.get("smarttoken_viewer")!
    .value;
}

function requestWith(cookie: string) {
  return new NextRequest("http://localhost/api/session", {
    headers: { cookie: `smarttoken_viewer=${cookie}` },
  });
}

beforeEach(() => refreshToken.mockReset());

test("the session survives a replaced container", async () => {
  const cookie = signIn();
  // A new module registry stands in for a fresh instance with empty memory.
  // The old in-process Map made this impossible, which is what logged people
  // out whenever the platform recycled or redeployed the container.
  jest.resetModules();
  const fresh = await import("@/api/server-session");
  expect(fresh.readSession(requestWith(cookie))?.refreshToken).toBe(
    readSession(requestWith(cookie))?.refreshToken,
  );
});

test("the cookie never exposes the tokens and fits the browser limit", () => {
  const cookie = signIn(600);
  expect(cookie).not.toContain("header.");
  expect(Buffer.from(cookie, "base64url").toString("utf8")).not.toContain(
    "signature",
  );
  expect(cookie.length).toBeLessThan(4096);
});

test("an unremembered login writes a browser-session cookie", () => {
  const cookie = signInResponse().headers.get("set-cookie")!;

  expect(cookie).not.toMatch(/(?:expires|max-age)=/i);
});

test("a remembered login expires with its refresh token", () => {
  const cookie = signInResponse(0, true).headers.get("set-cookie")!;

  expect(cookie).toMatch(/expires=/i);
});

test("a tampered cookie is rejected", () => {
  const cookie = signIn();
  const flipped = `${cookie.slice(0, -4)}AAAA`;
  expect(readSession(requestWith(flipped))).toBeUndefined();
});

test("an expired access token is renewed and the new one is handed back", async () => {
  const cookie = signIn();
  const minted = jwt({ exp: Math.floor(Date.now() / 1000) + 900 });
  refreshToken.mockResolvedValue({ accessToken: minted });

  const result = await activeSession(requestWith(cookie));
  expect(result).toMatchObject({ status: "active", rotated: true });
  expect(result?.status === "active" && result.state.accessToken).toBe(minted);
});

// A refresh token is single-use. Two requests presenting the same one is a
// race the API settles with 409, which used to cost the loser a 503 and could
// orphan the winner's token: parallel responses each seal their own cookie and
// only the last one to the browser survives.
test("parallel requests share one rotation", async () => {
  const cookie = signIn();
  const minted = jwt({ exp: Math.floor(Date.now() / 1000) + 900 });
  let release: (result: unknown) => void = () => {};
  refreshToken.mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );

  const inFlight = Promise.all([
    activeSession(requestWith(cookie)),
    activeSession(requestWith(cookie)),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  release({ accessToken: minted });

  const [first, second] = await inFlight;

  expect(refreshToken).toHaveBeenCalledTimes(1);
  expect(first?.status === "active" && first.state.accessToken).toBe(minted);
  expect(second?.status === "active" && second.state.accessToken).toBe(minted);
});

test("sequential helpers in one request reuse a completed rotation", async () => {
  const request = requestWith(signIn());
  const minted = jwt({ exp: Math.floor(Date.now() / 1000) + 900 });
  refreshToken.mockResolvedValue({ accessToken: minted });

  const first = await activeSession(request);
  const second = await activeSession(request);

  expect(refreshToken).toHaveBeenCalledTimes(1);
  expect(first?.status === "active" && first.state.accessToken).toBe(minted);
  expect(second?.status === "active" && second.state.accessToken).toBe(minted);
});

test("a transient refresh failure keeps the wallet signed in", async () => {
  const cookie = signIn();
  refreshToken.mockRejectedValue(new Error("socket hang up"));

  expect(await activeSession(requestWith(cookie))).toMatchObject({
    status: "unavailable",
  });
});

test("a rejected refresh token ends the session", async () => {
  const cookie = signIn();
  refreshToken.mockRejectedValue(
    new ResponseError(new Response(null, { status: 401 })),
  );

  expect(await activeSession(requestWith(cookie))).toEqual({
    status: "expired",
  });
});

// There is no fallback key: a key derivable from the source would let anyone
// author their own session cookie. Production without a valid SESSION_SECRET
// seals nothing, opens nothing and says so in the operator log; the session
// routes answer 503 session_unavailable (proxy.test.ts).
describe("session key", () => {
  async function withEnvironment(
    nodeEnv: string,
    secret: string | undefined,
    run: (module: typeof import("@/api/server-session")) => Promise<void>,
  ) {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSecret = process.env.SESSION_SECRET;
    if (secret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = secret;
    (process.env as Record<string, string>).NODE_ENV = nodeEnv;
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      jest.resetModules();
      await run(await import("@/api/server-session"));
    } finally {
      error.mockRestore();
      (process.env as Record<string, string>).NODE_ENV = previousNodeEnv!;
      if (previousSecret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = previousSecret;
      jest.resetModules();
    }
  }

  for (const [label, secret] of [
    ["a missing", undefined],
    ["an invalid (16-byte)", randomBytes(16).toString("base64")],
    ["an invalid (not base64)", "not a key at all, just text"],
  ] as const) {
    it(`production with ${label} key seals nothing and opens nothing`, async () => {
      // Values sealed earlier with a real key must not open either.
      const sealedElsewhere = signIn();
      const purposeSealedElsewhere = sealForPurpose("any", { a: 1 });
      await withEnvironment("production", secret, async (prod) => {
        expect(prod.sessionAvailable()).toBe(false);
        const response = NextResponse.json({});
        expect(() =>
          prod.establishSession(response, login(), tenant, "email"),
        ).toThrow(prod.SessionUnavailableError);
        expect(
          response.cookies.get("__Host-smarttoken_viewer"),
        ).toBeUndefined();
        expect(() => prod.sealForPurpose("any", { a: 1 })).toThrow(
          "Sign-in is unavailable",
        );
        expect(prod.readSession(requestWith(sealedElsewhere))).toBeUndefined();
        expect(
          prod.unsealForPurpose("any", purposeSealedElsewhere),
        ).toBeUndefined();
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining("wallet sessions are unavailable"),
        );
      });
    });
  }

  it("a local run with an explicit ephemeral key seals and opens its own sessions only", async () => {
    const key = randomBytes(32).toString("base64");
    let sealed = "";
    await withEnvironment("development", key, async (local) => {
      expect(local.sessionAvailable()).toBe(true);
      const response = NextResponse.json({});
      expect(local.establishSession(response, login(), tenant, "email")).toBe(
        true,
      );
      sealed = response.cookies.get("smarttoken_viewer")!.value;
      expect(local.readSession(requestWith(sealed))).toMatchObject({
        organizationId: tenant.organizationId,
        host: tenant.host,
      });
      const value = local.sealForPurpose("purpose-a", { ok: true });
      expect(local.unsealForPurpose("purpose-a", value)).toEqual({ ok: true });
      expect(local.unsealForPurpose("purpose-b", value)).toBeUndefined();
    });
    // Another run's ephemeral key cannot open it.
    await withEnvironment(
      "development",
      randomBytes(32).toString("base64"),
      async (other) => {
        expect(other.readSession(requestWith(sealed))).toBeUndefined();
      },
    );
    // A local run without an explicit key has no implicit one either.
    await withEnvironment("development", undefined, async (none) => {
      expect(none.sessionAvailable()).toBe(false);
      expect(none.readSession(requestWith(sealed))).toBeUndefined();
    });
  });
});

// Dropping the cookie is not a sign-out on its own: the refresh token sealed
// inside it stays usable upstream for thirty days unless the API is told.
describe("revokeSession", () => {
  beforeEach(() => logout.mockReset());

  it("revokes the refresh token held in the cookie", async () => {
    logout.mockResolvedValue({});

    await revokeSession(requestWith(signIn()));

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("does not throw when the API rejects the revoke", async () => {
    logout.mockRejectedValue(
      new ResponseError(new Response(null, { status: 401 }), "unauthorized"),
    );

    await expect(revokeSession(requestWith(signIn()))).resolves.toBeUndefined();
  });

  it("is a no-op without a session cookie", async () => {
    await revokeSession(new NextRequest("http://localhost/api/session/logout"));

    expect(logout).not.toHaveBeenCalled();
  });
});
