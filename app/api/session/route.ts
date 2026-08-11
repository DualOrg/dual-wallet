import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  refreshCurrentWallet,
  requestSession,
} from "@/api/server-session";

export async function GET(request: NextRequest) {
  const session = requestSession(request);
  if (!session) {
    const response = NextResponse.json(
      { authenticated: false },
      { status: 401 },
    );
    clearSessionCookie(response);
    return response;
  }

  const wallet = await refreshCurrentWallet(request);
  if (!wallet) {
    const response = NextResponse.json(
      { authenticated: false },
      { status: 401 },
    );
    clearSessionCookie(response);
    return response;
  }

  return NextResponse.json(
    { authenticated: true, wallet },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
