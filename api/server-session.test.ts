/**
 * @jest-environment node
 */
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

// A deployment with no SESSION_SECRET has to seal a session anyway. Throwing
// here turned one missing variable into a 502 on every sign-in — email, passkey
// and EOA alike, since all of them end in establishSession — with nothing in the
// logs and the thrown message echoed to the browser.
test("production without SESSION_SECRET seals the session and says so", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSecret = process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET;
  (process.env as Record<string, string>).NODE_ENV = "production";
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

  try {
    jest.resetModules();
    const prod = await import("@/api/server-session");
    const response = NextResponse.json({});

    expect(prod.establishSession(response, login(), tenant, "email")).toBe(
      true,
    );
    expect(
      response.cookies.get("__Host-smarttoken_viewer")?.value,
    ).toBeTruthy();
    // Silently weaker is how this went unnoticed for a whole deployment.
    expect(warn).toHaveBeenCalled();
  } finally {
    warn.mockRestore();
    (process.env as Record<string, string>).NODE_ENV = previousNodeEnv!;
    if (previousSecret !== undefined)
      process.env.SESSION_SECRET = previousSecret;
    jest.resetModules();
  }
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
