/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

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
  // Sent to sign in, and still in the organization that was asked for.
  expect(anonymous.headers.get("location")).toBe(
    `http://localhost/${ORGANIZATION}/login`,
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
