import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  currentWallet,
  writeSession,
} from "@/api/server-session";

export async function GET(request: NextRequest) {
  const result = await currentWallet(request);

  if (result.status === "expired") {
    const response = NextResponse.json(
      { authenticated: false },
      { status: 401 },
    );
    clearSessionCookie(response);
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
