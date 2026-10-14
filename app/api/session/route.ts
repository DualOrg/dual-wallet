import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clearFaceHandover } from "@/api/face-handover";
import {
  clearSessionCookie,
  currentWallet,
  writeSession,
} from "@/api/server-session";
import { SESSION_COOKIE_NAME } from "@/api/settings";

export async function GET(request: NextRequest) {
  const result = await currentWallet(request);

  if (result.status === "expired") {
    const response = NextResponse.json(
      { authenticated: false },
      { status: 401 },
    );
    clearSessionCookie(response);
    // A session that existed and ended takes its pending face handover with
    // it (contract r14). A visitor who never signed in keeps an anonymous
    // ticket for the sign-in it is on its way to.
    if (request.cookies.get(SESSION_COOKIE_NAME)?.value) {
      clearFaceHandover(response);
    }
    return response;
  }

  // A failed renewal that the API did not reject leaves the session intact, so
  // report "unavailable" and let the client keep the wallet it already has.
  if (result.status === "unavailable") {
    return NextResponse.json(
      { message: "Session unavailable." },
      { status: 503 },
    );
  }

  const response = NextResponse.json(
    {
      authenticated: true,
      authenticationMethod: result.state.authenticationMethod,
      wallet: result.wallet,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  writeSession(response, result.state);
  return response;
}
