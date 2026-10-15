/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { resetWalletHostCache } from "@/api/wallet-host";
import { proxy } from "@/proxy";
import { edit } from "@/test/product-face-fixtures";
import {
  applyHostEnvironment,
  clearHostEnvironment,
  hostEnvironment,
  MORROW_ORIGIN,
  morrowDocument,
  tidewellDocument,
  TIDEWELL_ORIGIN,
  type HostDocument,
} from "@/test/wallet-host-fixtures";

const ORGANIZATION = "000000000000000000000001";
const ORGANIZATION_COOKIE = "smarttoken_viewer_org";
const PUBLIC = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify",
  "/otp",
];

function visit(path: string, cookie?: string) {
  return proxy(
    new NextRequest(`http://localhost${path}`, {
      headers: cookie ? { cookie } : {},
    }),
  );
}

test("an entry link serves the plain page and remembers its organization", () => {
  const response = visit(`/${ORGANIZATION}/login`);

  expect(response.headers.get("x-middleware-rewrite")).toBe(
    "http://localhost/login",
  );
  expect(response.cookies.get(ORGANIZATION_COOKIE)?.value).toBe(ORGANIZATION);
});

test("an uppercase organization ID is stored the way the API writes it", () => {
  const response = visit(`/${ORGANIZATION.toUpperCase()}/login`);

  expect(response.cookies.get(ORGANIZATION_COOKIE)?.value).toBe(ORGANIZATION);
});

test("the bare prefix opens the root route", () => {
  expect(visit(`/${ORGANIZATION}`).headers.get("x-middleware-rewrite")).toBe(
    "http://localhost/",
  );
});

test("the route guards run on the stripped path", () => {
  const anonymous = visit(`/${ORGANIZATION}/inventory`);

  expect(anonymous.status).toBe(307);
  // Sent to sign in, still in the organization that was asked for, and told
  // where to come back to.
  expect(anonymous.headers.get("location")).toBe(
    `http://localhost/${ORGANIZATION}/login?next=%2Finventory`,
  );
  expect(anonymous.cookies.get(ORGANIZATION_COOKIE)?.value).toBe(ORGANIZATION);

  const signedIn = visit("/login", "smarttoken_viewer=sealed");
  expect(signedIn.headers.get("location")).toBe("http://localhost/inventory");
});

test("a known organization goes back into the address bar", () => {
  const remembered = `${ORGANIZATION_COOKIE}=${ORGANIZATION}`;

  for (const path of PUBLIC) {
    expect(visit(path, remembered).headers.get("location")).toBe(
      `http://localhost/${ORGANIZATION}${path}`,
    );
  }

  // Nothing to put back, and the authorized routes carry it in the session.
  expect(visit("/login").headers.get("location")).toBeNull();
  expect(
    visit("/inventory", `${remembered}; smarttoken_viewer=sealed`).headers.get(
      "location",
    ),
  ).toBeNull();
});

test("a path without an organization is left alone", () => {
  for (const path of [
    "/login",
    "/not-an-organization/login",
    "/6a1889/login",
  ]) {
    const response = visit(path);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.cookies.get(ORGANIZATION_COOKIE)).toBeUndefined();
  }
});

test("a mail link names its organization in the query", () => {
  for (const path of ["/verify", "/otp", "/reset-password"]) {
    const query = `organization_id=${ORGANIZATION}`;
    const response = visit(`${path}?${query}`);

    expect(response.cookies.get(ORGANIZATION_COOKIE)?.value).toBe(ORGANIZATION);
    // Moved into the address bar, with everything the page still reads.
    expect(response.headers.get("location")).toBe(
      `http://localhost/${ORGANIZATION}${path}?${query}`,
    );
  }
});

test("only a mail link may name it in the query", () => {
  for (const path of ["/login", "/register", "/inventory", "/settings"]) {
    expect(
      visit(`${path}?organization_id=${ORGANIZATION}`).cookies.get(
        ORGANIZATION_COOKIE,
      ),
    ).toBeUndefined();
  }
});

test("the path wins over the query", () => {
  const other = "5f2b1c4e8a9d0b3c7e6f1a24";
  const response = visit(`/${ORGANIZATION}/verify?organization_id=${other}`);

  expect(response.cookies.get(ORGANIZATION_COOKIE)?.value).toBe(ORGANIZATION);
});

test("a reset link keeps its token in a browser that is already signed in", () => {
  const signedIn = "smarttoken_viewer=sealed";
  const link = visit(
    `/${ORGANIZATION}/reset-password?token=abc&organization_id=${ORGANIZATION}`,
    signedIn,
  );

  // Served, not redirected: a redirect to /inventory would spend nothing and
  // drop the token.
  expect(link.headers.get("location")).toBeNull();
  expect(link.headers.get("x-middleware-rewrite")).toBe(
    `http://localhost/reset-password?token=abc&organization_id=${ORGANIZATION}`,
  );

  // Browsed to with nothing to spend, it is an ordinary auth entry again.
  expect(
    visit(`/${ORGANIZATION}/reset-password`, signedIn).headers.get("location"),
  ).toBe("http://localhost/inventory");
});

test("a product task link survives sign-in as a validated return path", () => {
  const task = "/products/morrow-home/register/unit-7?step=confirm";
  const anonymous = visit(task);
  expect(anonymous.status).toBe(307);
  expect(anonymous.headers.get("location")).toBe(
    `http://localhost/login?next=${encodeURIComponent(task)}`,
  );

  // Once signed in, the auth entry forwards to that exact path and query.
  const signedIn = visit(
    `/login?next=${encodeURIComponent(task)}`,
    "smarttoken_viewer=sealed",
  );
  expect(signedIn.headers.get("location")).toBe(`http://localhost${task}`);
});

test("an unsafe return path is never followed", () => {
  for (const next of [
    "//evil.example/products",
    "https://evil.example/products",
    "/\\evil.example/products",
    "/products/a#fragment",
    "/api/session/logout",
    "/login",
    "products/relative",
    `/products/${"a".repeat(600)}`,
    "/products/../settings/../../x",
  ]) {
    const response = visit(
      `/login?next=${encodeURIComponent(next)}`,
      "smarttoken_viewer=sealed",
    );
    expect(response.headers.get("location")).toBe("http://localhost/inventory");
  }
});

test("only protected routes are offered as a return path", () => {
  for (const path of ["/products", "/activity?status=failed", "/settings"]) {
    expect(visit(path).headers.get("location")).toBe(
      `http://localhost/login?next=${encodeURIComponent(path)}`,
    );
  }
});

test("the face handover entry works signed-out and is never a return path (r14)", () => {
  // Not redirected: a sign-in redirect would carry the #ticket fragment along.
  const entry = visit("/products/morrow-home/handover");
  expect(entry.status).toBe(200);
  expect(entry.headers.get("location")).toBeNull();
  // Other product routes stay protected.
  expect(visit("/products/morrow-home/register").headers.get("location")).toBe(
    `http://localhost/login?next=${encodeURIComponent("/products/morrow-home/register")}`,
  );
  // The handover entry is never followed after sign-in.
  expect(
    visit(
      `/login?next=${encodeURIComponent("/products/morrow-home/handover")}`,
      "smarttoken_viewer=sealed",
    ).headers.get("location"),
  ).toBe("http://localhost/inventory");
});

// Without a valid SESSION_SECRET the session routes, the backend proxy and the
// product-face BFF fail closed before any handler runs.
describe("session key gate", () => {
  const previous = process.env.SESSION_SECRET;
  afterEach(() => {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  });
  const gated = [
    "/api/session",
    "/api/session/login",
    "/api/session/passkey/login/verify",
    "/api/backend/wallets/me",
    "/api/faces/morrow-home/assertions",
  ];

  for (const [label, secret] of [
    ["missing", undefined],
    ["invalid", Buffer.alloc(16, 7).toString("base64")],
  ] as const) {
    test(`a ${label} key answers 503 session_unavailable with a clear message`, async () => {
      if (secret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = secret;
      for (const path of gated) {
        const response = visit(path);
        expect(response.status).toBe(503);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual({
          code: "session_unavailable",
          message: expect.stringContaining("no valid session key configured"),
        });
      }
      // Pages and public routes are unaffected by the gate.
      expect(visit("/api/public/objects/x/display/card").status).not.toBe(503);
    });
  }

  test("an explicit key lets the session routes through", () => {
    process.env.SESSION_SECRET = Buffer.alloc(32, 9).toString("base64");
    for (const path of gated) {
      const response = visit(path);
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });
});

// A branded host: the same proxy, configured only by its environment.
describe("branded host pages", () => {
  const UNIT = "aaaaaaaaaaaaaaaaaaaaaaaa";
  function host(document: HostDocument) {
    resetWalletHostCache();
    applyHostEnvironment(hostEnvironment(document));
  }
  function visitHost(origin: string, path: string, cookie?: string) {
    const { host } = new URL(origin);
    return proxy(
      new NextRequest(`${origin}${path}`, {
        headers: { host, ...(cookie ? { cookie } : {}) },
      }),
    );
  }
  const notFound = (origin: string) => `${origin}/_wallet-host/not-found`;
  afterEach(() => {
    clearHostEnvironment();
    resetWalletHostCache();
  });

  test("a disabled journey's pages answer the not-found page, signed in or out", () => {
    host(tidewellDocument());
    for (const path of [
      "/products/tidewell-care/service",
      "/products/tidewell-care/accept",
      `/products/tidewell-care/products/${UNIT}/transfer`,
      "/products/tidewell-care/claims",
      "/products/morrow-home/register",
      "/products/morrow-home/handover",
    ]) {
      for (const cookie of [undefined, "smarttoken_viewer=sealed"]) {
        const response = visitHost(TIDEWELL_ORIGIN, path, cookie);
        expect([path, response.headers.get("x-middleware-rewrite")]).toEqual([
          path,
          notFound(TIDEWELL_ORIGIN),
        ]);
        expect(response.headers.get("location")).toBeNull();
        expect(response.cookies.getAll()).toEqual([]);
      }
    }
  });

  test("an enabled journey's pages keep every existing guard", () => {
    host(tidewellDocument());
    const task = "/products/tidewell-care/register";
    expect(visitHost(TIDEWELL_ORIGIN, task).headers.get("location")).toBe(
      `${TIDEWELL_ORIGIN}/login?next=${encodeURIComponent(task)}`,
    );
    const signedIn = visitHost(
      TIDEWELL_ORIGIN,
      task,
      "smarttoken_viewer=sealed",
    );
    expect(signedIn.headers.get("x-middleware-next")).toBe("1");
    expect(
      visitHost(TIDEWELL_ORIGIN, "/products/tidewell-care/handover").status,
    ).toBe(200);
  });

  test("the programme list is the My products journey's page", () => {
    const document = morrowDocument();
    edit(document, "journeys.myProducts", false);
    edit(document, "navigation", ["inventory", "settings"]);
    host(document);
    expect(
      visitHost(
        MORROW_ORIGIN,
        "/products",
        "smarttoken_viewer=sealed",
      ).headers.get("x-middleware-rewrite"),
    ).toBe(notFound(MORROW_ORIGIN));
    expect(
      visitHost(
        MORROW_ORIGIN,
        "/inventory",
        "smarttoken_viewer=sealed",
      ).headers.get("x-middleware-next"),
    ).toBe("1");
  });

  test("a signed-in visitor lands on the host's home", () => {
    host(morrowDocument());
    expect(
      visitHost(
        MORROW_ORIGIN,
        "/login",
        "smarttoken_viewer=sealed",
      ).headers.get("location"),
    ).toBe(`${MORROW_ORIGIN}/`);
    // An explicit return path still wins.
    expect(
      visitHost(
        MORROW_ORIGIN,
        `/login?next=${encodeURIComponent("/settings")}`,
        "smarttoken_viewer=sealed",
      ).headers.get("location"),
    ).toBe(`${MORROW_ORIGIN}/settings`);
  });
});
