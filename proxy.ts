import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/api/settings";

const PROTECTED = ["/inventory", "/activity", "/settings"];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const protectedRoute = PROTECTED.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (protectedRoute && !request.cookies.get(SESSION_COOKIE_NAME)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
