import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  SESSION_UNAVAILABLE_CODE,
  SESSION_UNAVAILABLE_MESSAGE,
  sessionKeyFromEnv,
} from "@/api/session-key";
import { ORGANIZATION_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/api/settings";
import {
  HOST_NOTICE_CODE,
  HOST_NOTICE_STATUS,
  hostNoticeCopy,
  hostNoticeHtml,
  type HostNoticeKind,
} from "@/api/host-notice";
import { chosenOrganizationId } from "@/api/tenant";
import {
  HOST_NOT_FOUND_PATH,
  hostLanding,
  hostPageAllowed,
  isEntranceHost,
  requestHostOf,
  walletHost,
} from "@/api/wallet-host";
import { isProtectedPath, safeReturnPath } from "@/app/_domain/navigation";
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

// The routes that seal or open a session: sign-in and session, the backend
// proxy and the product-face BFF. Without a valid SESSION_SECRET they fail
// closed here, before any handler runs.
const SESSION_API = /^\/api\/(?:session|backend|faces)(?:\/|$)/;

// A branded host that cannot serve as itself answers every page and BFF route
// here with a neutral notice: never the generic wallet, never a brand.
function hostNotice(request: NextRequest, kind: HostNoticeKind) {
  const status = HOST_NOTICE_STATUS[kind];
  const headers = { "Cache-Control": "no-store" };
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { code: HOST_NOTICE_CODE[kind], message: hostNoticeCopy(kind).title },
      { status, headers },
    );
  }
  return new NextResponse(hostNoticeHtml(kind), {
    status,
    headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}

export function proxy(request: NextRequest) {
  const host = walletHost();
  if (host.status === "invalid") return hostNotice(request, "setup");
  if (
    host.status === "active" &&
    !isEntranceHost(requestHostOf(request.headers, request.nextUrl.host))
  ) {
    return hostNotice(request, "misdirected");
  }
  // A branded host names exactly one organisation: an entry link, mail link
  // or remembered cookie naming any other is not one here.
  const entranceOrganization =
    host.status === "active"
      ? host.configuration.entrance.organizationId
      : undefined;
  const organizationOf = (value?: string) => {
    const organizationId = chosenOrganizationId(value);
    return entranceOrganization && organizationId !== entranceOrganization
      ? undefined
      : organizationId;
  };
  if (SESSION_API.test(request.nextUrl.pathname)) {
    if (sessionKeyFromEnv()) return NextResponse.next();
    return NextResponse.json(
      { code: SESSION_UNAVAILABLE_CODE, message: SESSION_UNAVAILABLE_MESSAGE },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const url = request.nextUrl.clone();
  const first = ENTRY_PREFIX.exec(url.pathname);
  // A branded host serves its API only at its own paths. An entry-link prefix
  // in front of /api is not one: rewriting it would hand the route handler a
  // path other than the one it serves (the generic wallet keeps its rewrite).
  if (
    host.status === "active" &&
    first &&
    chosenOrganizationId(first[1]) &&
    /^\/api(?:\/|$)/.test(url.pathname.slice(first[0].length))
  ) {
    return NextResponse.json(
      { code: "not_found", message: "Not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  const prefixed = organizationOf(first?.[1]);
  if (prefixed) {
    url.pathname = url.pathname.slice(first![0].length) || "/";
  }

  const pathname = url.pathname;
  // A branded host serves no page of a disabled journey or of a face that is
  // not its own: the request is answered by the not-found page (404) before
  // any guard, redirect or cookie.
  if (!hostPageAllowed(pathname)) {
    url.pathname = HOST_NOT_FOUND_PATH;
    url.search = "";
    return NextResponse.rewrite(url);
  }
  // The path wins over the query. A mail link that names one organization in
  // each place is malformed, and the visible one is the honest answer.
  const chosen =
    prefixed ??
    (MAIL_ENTRY.includes(pathname)
      ? organizationOf(url.searchParams.get("organization_id") ?? undefined)
      : undefined);
  const current = organizationOf(
    request.cookies.get(ORGANIZATION_COOKIE_NAME)?.value,
  );
  const organizationId = chosen ?? current;
  const entry = organizationId ? `/${organizationId}` : "";

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const protectedRoute = isProtectedPath(pathname);

  let response: NextResponse;
  if (protectedRoute && !hasSession) {
    // Sign-in returns to the exact route and task that was asked for, as a
    // validated same-origin relative path. Anything else is dropped.
    const next = safeReturnPath(`${pathname}${url.search}`);
    url.pathname = `${entry}/login`;
    url.search = next ? `?next=${encodeURIComponent(next)}` : "";
    response = NextResponse.redirect(url);
  } else if (hasSession && isAuthEntry(pathname, url.searchParams)) {
    // ponytail: a visitor signed in to one organization who opens another one's
    // entry link goes to /inventory first, then back to /login once the session
    // fails its tenant check. Unsealing the session here would save the hop.
    const next = safeReturnPath(url.searchParams.get("next"));
    const target = new URL(next ?? hostLanding(), url);
    url.pathname = target.pathname;
    url.search = target.search;
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
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
    "/api/session/:path*",
    "/api/backend/:path*",
    "/api/faces/:path*",
  ],
};
