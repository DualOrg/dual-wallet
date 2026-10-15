/**
 * @jest-environment node
 */
// A branded host binds sign-in and every session, journal and face request to
// its one organisation on its one entrance. Sessions, journals and selections
// of another organisation, host or session are refused; the existing
// stale-context checks apply unchanged.
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_ORGANIZATION_ID } from "@/api/tenant";
import { HOLDER, TEMPLATE_A } from "@/test/product-face-fixtures";
import {
  applyHostEnvironment,
  clearHostEnvironment,
  hostEnvironment,
  MORROW_ORGANIZATION,
  MORROW_ORIGIN,
  morrowDocument,
  TIDEWELL_ORGANIZATION,
} from "@/test/wallet-host-fixtures";

const getWallet = jest.fn();
const loginWallet = jest.fn();
const getObjectById = jest.fn();
jest.mock("@/api/web-sdk-client", () => ({
  ...jest.requireActual("@/api/web-sdk-client"),
  getWalletsApi: () => ({ getWallet, loginWallet, logout: jest.fn() }),
  getObjectsApi: () => ({ getObjectById, getObjectByIdPublic: jest.fn() }),
}));
const minted = jest.fn();
jest.mock("@/api/face-assertion", () => {
  const actual = jest.requireActual("@/api/face-assertion");
  return {
    ...actual,
    mintFaceAssertion: (...args: unknown[]) => {
      minted(...args);
      return actual.mintFaceAssertion(...args);
    },
  };
});

import { establishSession } from "@/api/server-session";
import { resetWalletHostCache } from "@/api/wallet-host";
import type { LoginOut } from "@/api/web-sdk/models/LoginOut";
import { POST as assertionsPOST } from "@/app/api/faces/[slug]/assertions/route";
import { POST as selectionPOST } from "@/app/api/faces/[slug]/selection/route";
import { POST as loginPOST } from "@/app/api/session/login/route";
import { GET as sessionGET } from "@/app/api/session/route";

const ENTRANCE = "wallet.morrow.example";
const SLUG = "morrow-home";
const UNIT = "aaaaaaaaaaaaaaaaaaaaaaaa";
const SESSION_COOKIE = "smarttoken_viewer";

function jwt(claims: Record<string, unknown>) {
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
}

const login = (organizationId: string) =>
  ({
    accessToken: jwt({
      org_id: organizationId,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
    refreshToken: jwt({ exp: Math.floor(Date.now() / 1000) + 7200 }),
    wallet: walletDto(),
  }) as unknown as LoginOut;

function walletDto() {
  return {
    id: "wallet-1",
    language: "en",
    fqdn: ENTRANCE,
    activated: true,
    emailVerified: true,
    disabled: false,
    account: {
      address: HOLDER,
      type: "SMART_WALLET",
      controller: { address: "0xc", type: "SECP256K1", custody: "custodial" },
      smartAccount: {},
    },
    whenCreated: new Date(),
    whenModified: new Date(),
  };
}

class Browser {
  cookies = new Map<string, string>();
  launchId = `launch-${"y".repeat(28)}`;

  /** A session sealed for `organizationId` on `host` (no tenant check). */
  constructor(organizationId?: string, host = ENTRANCE) {
    if (!organizationId) return;
    const response = NextResponse.json({});
    establishSession(
      response,
      login(organizationId),
      { organizationId, subdomain: "*", host },
      "email",
    );
    this.take(response);
  }

  take(response: Response) {
    for (const cookie of (response as NextResponse).cookies.getAll()) {
      if (cookie.value) this.cookies.set(cookie.name, cookie.value);
      else this.cookies.delete(cookie.name);
    }
    return response;
  }

  request(path: string, body?: unknown, extra: Record<string, string> = {}) {
    return new NextRequest(`${MORROW_ORIGIN}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        host: ENTRANCE,
        origin: MORROW_ORIGIN,
        cookie: Array.from(this.cookies, ([k, v]) => `${k}=${v}`).join("; "),
        "x-dual-face-launch": this.launchId,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async face(
    handler: typeof selectionPOST,
    route: string,
    body: unknown,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = this.take(
      await handler(this.request(`/api/faces/${SLUG}${route}`, body), {
        params: Promise.resolve({ slug: SLUG }),
      }),
    );
    return { status: response.status, body: await response.json() };
  }

  async session() {
    const response = this.take(await sessionGET(this.request("/api/session")));
    return response.status;
  }
}

beforeEach(() => {
  resetWalletHostCache();
  applyHostEnvironment(hostEnvironment(morrowDocument()));
  process.env.FACE_ASSERTION_KEY_ID = "wallet-face-test";
  process.env.FACE_ASSERTION_SIGNING_KEY = (
    jest.requireActual("node:crypto") as typeof import("node:crypto")
  )
    .generateKeyPairSync("ed25519")
    .privateKey.export({ format: "pem", type: "pkcs8" })
    .toString();
  minted.mockReset();
  loginWallet.mockReset();
  getWallet.mockReset().mockResolvedValue(walletDto());
  getObjectById.mockReset().mockResolvedValue({
    id: UNIT,
    templateId: TEMPLATE_A,
    owner: HOLDER,
    custom: { recordId: "rec-0001", state: "Registered" },
    metadata: { name: "Arc grinder" },
    whenModified: new Date("2026-10-01T00:00:00Z"),
  });
});
afterEach(() => {
  clearHostEnvironment();
  resetWalletHostCache();
  delete process.env.FACE_ASSERTION_KEY_ID;
  delete process.env.FACE_ASSERTION_SIGNING_KEY;
});

describe("sessions on a branded host", () => {
  it("serves a session of its own organisation on its entrance", async () => {
    expect(await new Browser(MORROW_ORGANIZATION).session()).toBe(200);
  });

  it("refuses a session of another organisation, the default one or another host", async () => {
    for (const browser of [
      new Browser(TIDEWELL_ORGANIZATION),
      new Browser(DEFAULT_ORGANIZATION_ID),
      new Browser(MORROW_ORGANIZATION, "wallet.tidewell.example"),
    ]) {
      expect(await browser.session()).toBe(401);
      // The refused cookie is cleared, as for any session that is not this
      // host's.
      expect(browser.cookies.has(SESSION_COOKIE)).toBe(false);
    }
    expect(getWallet).not.toHaveBeenCalled();
  });

  it("refuses face requests and mints nothing for another organisation's session", async () => {
    const browser = new Browser(TIDEWELL_ORGANIZATION);
    expect(
      await browser.face(selectionPOST, "/selection", { object_id: UNIT }),
    ).toEqual({
      status: 401,
      body: expect.objectContaining({ code: "session_expired" }),
    });
    expect(
      await new Browser(TIDEWELL_ORGANIZATION).face(
        assertionsPOST,
        "/assertions",
        {
          operation: "transfer.offer.read",
          operation_id: "transfer-op-0001",
          target: {},
          request_hash: `sha256:${"d".repeat(64)}`,
        },
      ),
    ).toMatchObject({ status: 401 });
    expect(minted).not.toHaveBeenCalled();
  });
});

describe("sign-in on a branded host", () => {
  const signIn = (cookie = "") =>
    loginPOST(
      new NextRequest(`${MORROW_ORIGIN}/api/session/login`, {
        method: "POST",
        headers: {
          host: ENTRANCE,
          origin: MORROW_ORIGIN,
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify({ email: "a@example.com", password: "secret12" }),
      }),
    );

  it("signs in against the entrance organisation, whatever a cookie names", async () => {
    loginWallet.mockResolvedValue(login(MORROW_ORGANIZATION));
    const response = await signIn(
      `smarttoken_viewer_org=${TIDEWELL_ORGANIZATION}`,
    );
    expect(response.status).toBe(200);
    expect(loginWallet).toHaveBeenCalledWith(
      {
        loginIn: expect.objectContaining({
          organizationId: MORROW_ORGANIZATION,
        }),
      },
      { cache: "no-store" },
    );
    expect(
      (response as NextResponse).cookies.get(SESSION_COOKIE)?.value,
    ).toBeTruthy();
  });

  it("refuses a sign-in whose token names another organisation", async () => {
    loginWallet.mockResolvedValue(login(TIDEWELL_ORGANIZATION));
    const response = await signIn();
    expect(response.status).toBe(403);
    expect((response as NextResponse).cookies.get(SESSION_COOKIE)).toBe(
      undefined,
    );
  });
});

describe("stale context on a branded host", () => {
  it("a selection, journal or context of another session is never this one's", async () => {
    const holder = new Browser(MORROW_ORGANIZATION);
    const selected = await holder.face(selectionPOST, "/selection", {
      object_id: UNIT,
    });
    expect(selected.status).toBe(200);
    const contextId = selected.body.context_id as string;
    const request = {
      operation: "products.private.read",
      operation_id: "product-op-001",
      target: { object_id: UNIT },
      request_hash: `sha256:${"d".repeat(64)}`,
      context_id: contextId,
    };
    // The holder's own launch mints for its own selection.
    expect(
      (await holder.face(assertionsPOST, "/assertions", request)).status,
    ).toBe(200);
    expect(minted).toHaveBeenCalledTimes(1);

    // Another session of the same organisation, carrying the holder's
    // context id and even its sealed journal cookie, gets nothing.
    const other = new Browser(MORROW_ORGANIZATION);
    other.launchId = holder.launchId;
    for (const [name, value] of holder.cookies) {
      if (name !== SESSION_COOKIE) other.cookies.set(name, value);
    }
    expect(await other.face(assertionsPOST, "/assertions", request)).toEqual({
      status: 409,
      body: expect.objectContaining({ code: "stale_context" }),
    });

    // A new selection replaces the old one: the old context mints nothing.
    const reselected = await holder.face(selectionPOST, "/selection", {
      object_id: UNIT,
    });
    expect(reselected.body.context_id).not.toBe(contextId);
    expect(await holder.face(assertionsPOST, "/assertions", request)).toEqual({
      status: 409,
      body: expect.objectContaining({ code: "stale_context" }),
    });
    expect(minted).toHaveBeenCalledTimes(1);
  });
});

describe("an invalid configuration", () => {
  it("refuses every face request before any session is read", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    resetWalletHostCache();
    applyHostEnvironment({
      ...hostEnvironment(morrowDocument()),
      WALLET_HOST_CONFIGURATION_SHA256: "6".repeat(64),
    });
    expect(
      await new Browser(MORROW_ORGANIZATION).face(selectionPOST, "/selection", {
        object_id: UNIT,
      }),
    ).toEqual({
      status: 503,
      body: expect.objectContaining({ code: "host_unavailable" }),
    });
    expect(getWallet).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
