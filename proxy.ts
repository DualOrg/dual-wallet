import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ORGANIZATION_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/api/settings";
import { chosenOrganizationId } from "@/api/tenant";

const PROTECTED = ["/inventory", "/activity", "/settings"];
const AUTH_ENTRY = ["/login", "/register", "/forgot-password"];

// Every unauthorized route. Each one keeps the organization in the address bar,
// so a reload, a bookmark, or a link handed to somebody else stays in the same
// wallet. The authorized routes need no prefix: their session carries it.
const PUBLIC = [...AUTH_ENTRY, "/reset-password", "/verify", "/otp"];

// The verification, sign-in-code and password-reset mails already name the
// organization in their link query, because one wallet hostname serves several
// of them. Those three pages accept it there as well as in the path. No other
// route does: a link that could set the organization anywhere could also sign a
// visitor out of the wallet they are using.
const MAIL_ENTRY = ["/verify", "/otp", "/reset-password"];

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

// A wallet entry link names its organization: /<organization-id>/login. The
// prefix is stripped here and kept in a cookie, so the pages and the
// `/api/session/**` routes that this matcher excludes all stay on the plain
// paths they already use.
const ENTRY_PREFIX = /^\/([^/]+)(?=\/|$)/;

// /reset-password is an auth entry only when it is browsed to. Carrying a token
// it is a mail link instead: it may open in a browser already signed in to
// another wallet, and redirecting it would drop the token the page exists to
// spend.
function isAuthEntry(pathname: string, query: URLSearchParams) {
  return (
    AUTH_ENTRY.includes(pathname) ||
    (pathname === "/reset-password" && !query.has("token"))
  );
}

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const first = ENTRY_PREFIX.exec(url.pathname);
  const prefixed = chosenOrganizationId(first?.[1]);
  if (prefixed) {
    url.pathname = url.pathname.slice(first![0].length) || "/";
  }

  const pathname = url.pathname;
  // The path wins over the query. A mail link that names one organization in
  // each place is malformed, and the visible one is the honest answer.
  const chosen =
    prefixed ??
    (MAIL_ENTRY.includes(pathname)
      ? chosenOrganizationId(
          url.searchParams.get("organization_id") ?? undefined,
        )
      : undefined);
  const current = chosenOrganizationId(
    request.cookies.get(ORGANIZATION_COOKIE_NAME)?.value,
  );
  const organizationId = chosen ?? current;
  const entry = organizationId ? `/${organizationId}` : "";

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const protectedRoute = PROTECTED.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  let response: NextResponse;
  if (protectedRoute && !hasSession) {
    url.pathname = `${entry}/login`;
    url.search = "";
    response = NextResponse.redirect(url);
  } else if (hasSession && isAuthEntry(pathname, url.searchParams)) {
    // ponytail: a visitor signed in to one organization who opens another one's
    // entry link goes to /inventory first, then back to /login once the session
    // fails its tenant check. Unsealing the session here would save the hop.
    url.pathname = "/inventory";
    url.search = "";
    response = NextResponse.redirect(url);
  } else if (!prefixed && entry && PUBLIC.includes(pathname)) {
    // The organization is known but absent from the address bar: a link from
    // one unauthorized page to the next, or a mail link that named it in the
    // query. Put it back, and keep the query the page still has to read.
    url.pathname = `${entry}${pathname}`;
    response = NextResponse.redirect(url);
  } else {
    response = prefixed ? NextResponse.rewrite(url) : NextResponse.next();
  }

  if (chosen && chosen !== current) {
    response.cookies.set(ORGANIZATION_COOKIE_NAME, chosen, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      // The verification mail opens this link from another site, and a strict
      // cookie would not travel with that first navigation.
      sameSite: "lax",
      path: "/",
      maxAge: THIRTY_DAYS_SECONDS,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
