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
// Every session-establishing SDK call answers the next account queued here.
const sessionAccounts: string[] = [];
const signedIn = jest.fn(async () => loginOut(sessionAccounts.shift()!));
jest.mock("@/api/web-sdk-client", () => ({
  getWalletsApi: () => ({
    getWallet,
    loginWallet: signedIn,
    registerWallet: signedIn,
    passkeyLoginVerify: signedIn,
    passkeyRegisterVerify: signedIn,
    connectEoa: signedIn,
    logout: jest.fn(),
  }),
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
import { ResponseError } from "@/api/web-sdk/runtime";
import { POST as eoaPOST } from "@/app/api/session/eoa/connect/route";
import { POST as loginPOST } from "@/app/api/session/login/route";
import { POST as passkeyLoginPOST } from "@/app/api/session/passkey/login/verify/route";
import { POST as passkeyRegisterPOST } from "@/app/api/session/passkey/register/verify/route";
import { POST as registerPOST } from "@/app/api/session/register/route";
import { GET as sessionGET } from "@/app/api/session/route";
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

  /**
   * Establishes a session for `walletId` through one of the real
   * session-establishing routes (email sign-in, registration, passkey sign-in,
   * passkey registration, EOA connection). No context is read.
   */
  async login(walletId: string, method: SignInMethod = "email") {
    sessionAccounts.push(walletId);
    const { handler, body } = SIGN_IN[method];
    const response = this.take(
      await handler(
        new NextRequest(`http://localhost/api/session/${method}`, {
          method: "POST",
          headers: {
            host: "localhost",
            origin: "http://localhost",
            "content-type": "application/json",
            cookie: Array.from(this.cookies, ([k, v]) => `${k}=${v}`).join(
              "; ",
            ),
          },
          body: JSON.stringify(body(walletId)),
        }),
      ),
    );
    getWallet.mockResolvedValue(walletDto(walletId));
    return {
      status: response.status,
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

type SignInMethod =
  "email" | "register" | "passkey" | "passkey-register" | "eoa";
const SIGN_IN: Record<
  SignInMethod,
  {
    handler: (request: NextRequest) => Promise<Response>;
    body: (walletId: string) => Record<string, unknown>;
  }
> = {
  email: {
    handler: loginPOST,
    body: (id) => ({ email: `${id}@example.test`, password: "fictional" }),
  },
  register: {
    handler: registerPOST,
    body: (id) => ({ email: `${id}@example.test`, password: "fictional-1" }),
  },
  passkey: {
    handler: passkeyLoginPOST,
    body: () => ({
      id: "credential-1",
      rawId: "credential-1",
      type: "public-key",
      response: {
        clientDataJSON: "client-data",
        authenticatorData: "authenticator-data",
        signature: "signature",
      },
    }),
  },
  "passkey-register": {
    handler: passkeyRegisterPOST,
    body: () => ({
      id: "credential-2",
      rawId: "credential-2",
      type: "public-key",
      response: {
        clientDataJSON: "client-data",
        attestationObject: "attestation",
      },
    }),
  },
  eoa: {
    handler: eoaPOST,
    body: () => ({ challenge: "challenge-1", signature: "0xsignature" }),
  },
};

function loginOut(walletId: string) {
  return {
    wallet: walletDto(walletId),
    accessToken: jwt({
      org_id: DEFAULT_ORGANIZATION_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
    refreshToken: jwt({ exp: Math.floor(Date.now() / 1000) + 7200 }),
  };
}

function walletDto(id: string) {
  return {
    id,
    account: {
      address: HOLDER,
      type: "SMART_WALLET",
      controller: { address: "0xcontroller" },
      smartAccount: {},
    },
    whenCreated: new Date(),
    whenModified: new Date(),
    emailVerified: true,
  };
}

beforeEach(() => {
  process.env.PRODUCT_FACE_APPLICATIONS = enabled();
  sessionAccounts.length = 0;
  signedIn.mockClear();
  getWallet.mockReset().mockResolvedValue(walletDto("wallet-1"));
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

// Account isolation is enforced by the server: the ticket is sealed with the
// session that may take it, never left to the client's best-effort DELETE.
describe("transfer acceptance through the same entry (G8, contract r16)", () => {
  const accept = (
    browser: Browser,
    ticket: unknown = TICKET,
    kind: unknown = "accept",
  ) =>
    browser.call(handoverPOST, `/api/faces/${SLUG}/handover`, {
      method: "POST",
      body: { ticket, kind },
    });

  it("stores an acceptance ticket and answers the accept task; only the accept task's context read hands it over, as acceptance", async () => {
    const browser = new Browser();
    const stored = await accept(browser);
    expect(stored).toMatchObject({
      status: 200,
      body: { next: "/products/morrow-home/accept" },
    });
    expect(stored.cookie?.value).not.toContain(TICKET);
    browser.signIn();
    // Never on the register task, and never as a handover.
    const register = await browser.context("/register");
    expect(register.body).not.toHaveProperty("handover");
    expect(register.body).not.toHaveProperty("acceptance");
    const read = await browser.context("/accept");
    expect(read.body.acceptance).toEqual({ ticket: TICKET });
    expect(read.body).not.toHaveProperty("handover");
    expect(read.cookie?.value).toBe("");
    expect((await browser.context("/accept")).body).not.toHaveProperty(
      "acceptance",
    );
  });

  it("a registration handover is never handed over on the accept task", async () => {
    const browser = new Browser().signIn();
    await browser.handover();
    expect((await browser.context("/accept")).body).not.toHaveProperty(
      "acceptance",
    );
    expect((await browser.context("/register")).body.handover).toEqual({
      ticket: TICKET,
    });
  });

  it("refuses another kind or extra keys and stores nothing", async () => {
    const browser = new Browser();
    for (const kind of ["transfer", "", 1]) {
      const refused = await accept(browser, TICKET, kind);
      expect(refused.status).toBe(400);
      expect(refused.cookie).toBeUndefined();
    }
  });

  it("stays bound to the account that signs in: another account's session is denied", async () => {
    const browser = new Browser();
    await accept(browser);
    await browser.login("wallet-a");
    const other = new Browser();
    other.cookies = new Map(browser.cookies);
    await other.login("wallet-b");
    const read = await other.context("/accept");
    expect(read.body).not.toHaveProperty("acceptance");
  });
});

describe("face handover account isolation (contract r14)", () => {
  it("signed-in A stores it; B's session in the same browser, with A's client deletion lost, is denied and the cookie cleared", async () => {
    getWallet.mockResolvedValue(walletDto("wallet-a"));
    const browser = new Browser().signIn();
    expect((await browser.handover()).status).toBe(200);
    // A new session for B replaces A's session cookie (no client DELETE ever arrives).
    browser.signIn();
    getWallet.mockResolvedValue(walletDto("wallet-b"));
    const asB = await browser.context("/register");
    expect(asB.status).toBe(200);
    expect(asB.body).not.toHaveProperty("handover");
    expect(asB.cookie?.value).toBe("");
    expect(browser.cookies.has(FACE_HANDOVER_COOKIE)).toBe(false);
  });

  it("the same account in another session (the same wallet, another sign-in) is denied too", async () => {
    getWallet.mockResolvedValue(walletDto("wallet-a"));
    const browser = new Browser().signIn();
    await browser.handover();
    // Another session id without passing a sign-in route: the binding is exact.
    browser.signIn();
    const read = await browser.context("/register");
    expect(read.body).not.toHaveProperty("handover");
    expect(read.cookie?.value).toBe("");
  });

  it("signing in as B through the login route clears A's ticket in that very response", async () => {
    getWallet.mockResolvedValue(walletDto("wallet-a"));
    const browser = new Browser().signIn();
    await browser.handover();
    const login = await browser.login("wallet-b");
    expect(login.status).toBe(200);
    expect(login.cookie?.value).toBe("");
    expect((await browser.context("/register")).body).not.toHaveProperty(
      "handover",
    );
  });

  it("an anonymous ticket survives the first sign-in as A and is handed over once; a later switch to B rejects", async () => {
    const browser = new Browser();
    expect((await browser.handover()).status).toBe(200);
    // The sign-in binds it to A in the login response.
    const loggedIn = await browser.login("wallet-a");
    expect(loggedIn.status).toBe(200);
    expect(loggedIn.cookie?.value).toBeTruthy();
    // Another task first: kept for the register task.
    expect((await browser.context("/products")).body).not.toHaveProperty(
      "handover",
    );
    // Then B signs in: A's (now bound) ticket is cleared.
    const second = new Browser();
    await second.handover();
    await second.login("wallet-a");
    const switched = await second.login("wallet-b");
    expect(switched.cookie?.value).toBe("");
    expect((await second.context("/register")).body).not.toHaveProperty(
      "handover",
    );
    // A, still signed in on the first browser, takes it exactly once.
    getWallet.mockResolvedValue(walletDto("wallet-a"));
    const first = await browser.context("/register");
    expect(first.body.handover).toEqual({ ticket: TICKET });
    expect(first.cookie?.value).toBe("");
    expect((await browser.context("/register")).body).not.toHaveProperty(
      "handover",
    );
  });

  it("an anonymous ticket is bound by the first authenticated context read", async () => {
    const browser = new Browser();
    await browser.handover();
    // A session established outside the sign-in routes (no binding yet).
    getWallet.mockResolvedValue(walletDto("wallet-a"));
    browser.signIn();
    const bound = await browser.context("/");
    expect(bound.body).not.toHaveProperty("handover");
    expect(bound.cookie?.value).toBeTruthy();
    // Now it is A's session's: another session cannot take it.
    browser.signIn();
    const other = await browser.context("/register");
    expect(other.body).not.toHaveProperty("handover");
    expect(other.cookie?.value).toBe("");
  });

  it("an expired session clears it, and a session that cannot be read stores nothing", async () => {
    getWallet.mockResolvedValue(walletDto("wallet-a"));
    const browser = new Browser().signIn();
    await browser.handover();
    getWallet.mockRejectedValue(
      new ResponseError(new Response(null, { status: 401 })),
    );
    const expired = await browser.context("/register");
    expect(expired.status).toBe(401);
    expect(expired.body).not.toHaveProperty("handover");
    expect(expired.cookie?.value).toBe("");
    // Signed in but the wallet cannot be read now: refused, nothing stored.
    const unavailable = new Browser().signIn();
    getWallet.mockRejectedValue(new Error("upstream down"));
    const refused = await unavailable.handover();
    expect(refused).toMatchObject({
      status: 503,
      body: { code: "temporarily_unavailable" },
    });
    expect(unavailable.cookies.has(FACE_HANDOVER_COOKIE)).toBe(false);
  });

  it("a session read that finds the session ended clears it; a visitor who never signed in keeps an anonymous ticket", async () => {
    const read = async (browser: Browser) => {
      const response = browser.take(
        await sessionGET(
          new NextRequest("http://localhost/api/session", {
            headers: {
              host: "localhost",
              cookie: Array.from(browser.cookies, ([k, v]) => `${k}=${v}`).join(
                "; ",
              ),
            },
          }),
        ),
      );
      return (response as NextResponse).cookies.get(FACE_HANDOVER_COOKIE);
    };
    const visitor = new Browser();
    await visitor.handover();
    expect(await read(visitor)).toBeUndefined();
    expect(visitor.cookies.has(FACE_HANDOVER_COOKIE)).toBe(true);
    getWallet.mockResolvedValue(walletDto("wallet-a"));
    const signedIn = new Browser().signIn();
    await signedIn.handover();
    getWallet.mockRejectedValue(
      new ResponseError(new Response(null, { status: 401 })),
    );
    expect((await read(signedIn))?.value).toBe("");
    expect(signedIn.cookies.has(FACE_HANDOVER_COOKIE)).toBe(false);
  });

  // Binding happens at the session-establishment boundary itself: an
  // anonymous ticket becomes A's in A's sign-in response, so a later sign-in
  // as B clears it even though no context was ever read under A, and with no
  // client DELETE at all.
  const METHODS: SignInMethod[] = [
    "email",
    "register",
    "passkey",
    "passkey-register",
    "eoa",
  ];
  it.each(METHODS)(
    "anonymous, then A signs in by %s (no context read), then B: B is denied and the cookie cleared",
    async (method) => {
      const browser = new Browser();
      expect((await browser.handover()).status).toBe(200);
      const asA = await browser.login("wallet-a", method);
      expect(asA.status).toBe(200);
      // Bound to A in A's own sign-in response (a rewritten, sealed cookie).
      expect(asA.cookie?.value).toBeTruthy();
      expect(signedIn).toHaveBeenCalledTimes(1);
      const asB = await browser.login("wallet-b", method);
      expect(asB.status).toBe(200);
      expect(asB.cookie?.value).toBe("");
      expect(browser.cookies.has(FACE_HANDOVER_COOKIE)).toBe(false);
      const read = await browser.context("/register");
      expect(read.status).toBe(200);
      expect(read.body).not.toHaveProperty("handover");
    },
  );

  it.each(METHODS)(
    "anonymous, then A signs in by %s, then a session for B that skipped every sign-in route: the context read refuses and clears",
    async (method) => {
      const browser = new Browser();
      await browser.handover();
      await browser.login("wallet-a", method);
      // B's session cookie arrives without passing a sign-in route.
      browser.signIn();
      getWallet.mockResolvedValue(walletDto("wallet-b"));
      const read = await browser.context("/register");
      expect(read.body).not.toHaveProperty("handover");
      expect(read.cookie?.value).toBe("");
    },
  );

  it.each(METHODS)(
    "anonymous, then A signs in by %s, then the register task: handed to A exactly once",
    async (method) => {
      const browser = new Browser();
      await browser.handover();
      await browser.login("wallet-a", method);
      const first = await browser.context("/register");
      expect(first.body.handover).toEqual({ ticket: TICKET });
      expect(first.cookie?.value).toBe("");
      expect((await browser.context("/register")).body).not.toHaveProperty(
        "handover",
      );
    },
  );
});
