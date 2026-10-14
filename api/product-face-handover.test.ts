/**
 * @jest-environment node
 */
// contract r14 faceEnabledHandover, wallet side, through the real routes:
// - the handover entry stores the face runtime's ticket only for a registry
//   slug whose binding enables handover, signed-out included, and answers the
//   register task;
// - the register task's context read hands the ticket over exactly once;
// - another task, another programme, logout and an account change get none.
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_ORGANIZATION_ID } from "@/api/tenant";
import type { LoginOut } from "@/api/web-sdk/models/LoginOut";
import { bindingInput, HOLDER } from "@/test/product-face-fixtures";

const getWallet = jest.fn();
jest.mock("@/api/web-sdk-client", () => ({
  getWalletsApi: () => ({ getWallet, logout: jest.fn() }),
  getObjectsApi: () => ({
    getObjectById: jest.fn(),
    getObjectByIdPublic: jest.fn(),
  }),
}));
// The pinned artifact is verified elsewhere (api/face-artifact.test.ts).
jest.mock("@/api/face-artifact", () => ({
  verifyFaceArtifact: async () => ({ ok: true }),
}));

import { FACE_HANDOVER_COOKIE } from "@/api/face-handover";
import { establishSession } from "@/api/server-session";
import { GET as contextGET } from "@/app/api/faces/[slug]/context/route";
import { POST as handoverPOST } from "@/app/api/faces/[slug]/handover/route";
import { DELETE as handoverDELETE } from "@/app/api/session/face-handover/route";
import { POST as logoutPOST } from "@/app/api/session/logout/route";

const SLUG = "morrow-home";
const TICKET = "t".repeat(43);

function jwt(claims: Record<string, unknown>) {
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
}

class Browser {
  cookies = new Map<string, string>();
  launchId = `launch-${"h".repeat(28)}`;

  signIn() {
    const response = NextResponse.json({});
    establishSession(
      response,
      {
        accessToken: jwt({
          org_id: DEFAULT_ORGANIZATION_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
        refreshToken: jwt({ exp: Math.floor(Date.now() / 1000) + 7200 }),
      } as unknown as LoginOut,
      {
        organizationId: DEFAULT_ORGANIZATION_ID,
        subdomain: "*",
        host: "localhost",
      },
      "email",
    );
    this.take(response);
    return this;
  }

  take(response: Response) {
    for (const cookie of (response as NextResponse).cookies.getAll()) {
      if (cookie.value) this.cookies.set(cookie.name, cookie.value);
      else this.cookies.delete(cookie.name);
    }
    return response;
  }

  async call(
    handler: (
      request: NextRequest,
      context: { params: Promise<{ slug: string }> },
    ) => Promise<Response>,
    path: string,
    {
      method = "GET",
      body,
      slug = SLUG,
    }: { method?: string; body?: unknown; slug?: string } = {},
  ) {
    const response = this.take(
      await handler(
        new NextRequest(`http://localhost${path}`, {
          method,
          headers: {
            host: "localhost",
            origin: "http://localhost",
            cookie: Array.from(this.cookies, ([k, v]) => `${k}=${v}`).join(
              "; ",
            ),
            "x-dual-face-launch": this.launchId,
            ...(body === undefined
              ? {}
              : { "content-type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        { params: Promise.resolve({ slug }) },
      ),
    );
    return {
      status: response.status,
      body: await response.json(),
      cookie: (response as NextResponse).cookies.get(FACE_HANDOVER_COOKIE),
    };
  }

  handover(ticket: unknown = TICKET, slug = SLUG) {
    return this.call(handoverPOST, `/api/faces/${slug}/handover`, {
      method: "POST",
      body: { ticket },
      slug,
    });
  }

  context(task = "/register", slug = SLUG) {
    return this.call(
      contextGET,
      `/api/faces/${slug}/context?task=${encodeURIComponent(task)}`,
      { slug },
    );
  }
}

const enabled = () =>
  JSON.stringify([
    bindingInput({ handover: { enabled: true } }),
    bindingInput({
      slug: "tidewell",
      programmeName: "Tidewell",
      handover: { enabled: true },
    }),
    bindingInput({ slug: "no-handover", programmeName: "Plain" }),
  ]);

beforeEach(() => {
  process.env.PRODUCT_FACE_APPLICATIONS = enabled();
  getWallet.mockReset().mockResolvedValue({
    id: "wallet-1",
    account: {
      address: HOLDER,
      type: "SMART_WALLET",
      controller: { address: "0xcontroller" },
      smartAccount: {},
    },
    whenCreated: new Date(),
    whenModified: new Date(),
    emailVerified: true,
  });
});
afterEach(() => {
  delete process.env.PRODUCT_FACE_APPLICATIONS;
});

describe("face handover entry (contract r14)", () => {
  it("signed-out: stores the ticket in the pre-auth cookie and answers the register task", async () => {
    const browser = new Browser();
    const stored = await browser.handover();
    expect(stored.status).toBe(200);
    expect(stored.body).toEqual({ next: "/products/morrow-home/register" });
    expect(JSON.stringify(stored.body)).not.toContain(TICKET);
    expect(stored.cookie).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 600,
    });
    expect(stored.cookie?.value).not.toContain(TICKET);
    // After sign-in the register task's context read hands it over once.
    browser.signIn();
    const first = await browser.context("/register");
    expect(first.status).toBe(200);
    expect(first.body.handover).toEqual({ ticket: TICKET });
    expect(first.cookie?.value).toBe("");
    // A reload or replay of the context read hands nothing over again.
    const again = await browser.context("/register");
    expect(again.body).not.toHaveProperty("handover");
  });

  it("signed-in arrival works the same way", async () => {
    const browser = new Browser().signIn();
    expect((await browser.handover()).status).toBe(200);
    expect((await browser.context("/register")).body.handover).toEqual({
      ticket: TICKET,
    });
  });

  it("is handed over on the register task only", async () => {
    const browser = new Browser().signIn();
    await browser.handover();
    for (const task of ["/", "/products", "/register/extra"]) {
      const read = await browser.context(task);
      expect(read.status).toBe(200);
      expect(read.body).not.toHaveProperty("handover");
    }
    // Still pending for the register task (no other task consumed it).
    expect((await browser.context("/register")).body.handover).toEqual({
      ticket: TICKET,
    });
  });

  it("is bound to its programme: another slug neither reads nor clears it", async () => {
    const browser = new Browser().signIn();
    await browser.handover();
    const other = await browser.context("/register", "tidewell");
    expect(other.body).not.toHaveProperty("handover");
    expect(other.cookie).toBeUndefined();
    expect((await browser.context("/register")).body.handover).toEqual({
      ticket: TICKET,
    });
  });

  it("refuses an unknown slug or a binding without handover and stores nothing", async () => {
    const browser = new Browser();
    for (const slug of ["unknown-brand", "no-handover"]) {
      const refused = await browser.handover(TICKET, slug);
      expect(refused).toMatchObject({
        status: 404,
        body: { code: "handover_unavailable" },
      });
      expect(refused.cookie).toBeUndefined();
    }
    expect(browser.cookies.has(FACE_HANDOVER_COOKIE)).toBe(false);
  });

  it("refuses a malformed ticket or body and stores nothing", async () => {
    const browser = new Browser();
    for (const body of [
      { ticket: "short" },
      { ticket: `${TICKET}#x` },
      { ticket: 42 },
      { ticket: TICKET, slug: "tidewell" },
    ]) {
      const refused = await browser.call(
        handoverPOST,
        `/api/faces/${SLUG}/handover`,
        { method: "POST", body },
      );
      expect(refused).toMatchObject({
        status: 400,
        body: { code: "invalid_request" },
      });
      expect(refused.cookie).toBeUndefined();
    }
  });

  it("refuses a cross-origin post", async () => {
    const response = await handoverPOST(
      new NextRequest(`http://localhost/api/faces/${SLUG}/handover`, {
        method: "POST",
        headers: {
          host: "localhost",
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ ticket: TICKET }),
      }),
      { params: Promise.resolve({ slug: SLUG }) },
    );
    expect(response.status).toBe(403);
    expect(
      (response as NextResponse).cookies.get(FACE_HANDOVER_COOKIE),
    ).toBeUndefined();
  });

  it("is cleared on logout and on an account change", async () => {
    getWallet.mockResolvedValue({
      id: "wallet-1",
      account: { address: HOLDER },
    });
    const browser = new Browser().signIn();
    await browser.handover();
    const loggedOut = browser.take(
      await logoutPOST(
        new NextRequest("http://localhost/api/session/logout", {
          method: "POST",
          headers: {
            host: "localhost",
            origin: "http://localhost",
            cookie: Array.from(browser.cookies, ([k, v]) => `${k}=${v}`).join(
              "; ",
            ),
          },
        }),
      ),
    );
    expect(
      (loggedOut as NextResponse).cookies.get(FACE_HANDOVER_COOKIE)?.value,
    ).toBe("");
    expect(browser.cookies.has(FACE_HANDOVER_COOKIE)).toBe(false);

    const other = new Browser().signIn();
    await other.handover();
    const cleared = other.take(
      await handoverDELETE(
        new NextRequest("http://localhost/api/session/face-handover", {
          method: "DELETE",
          headers: { host: "localhost", origin: "http://localhost" },
        }),
      ),
    );
    expect(
      (cleared as NextResponse).cookies.get(FACE_HANDOVER_COOKIE)?.value,
    ).toBe("");
    expect(other.cookies.has(FACE_HANDOVER_COOKIE)).toBe(false);
  });
});
