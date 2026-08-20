import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/api/server-session";
import { mutationGuard } from "@/api/request";

export async function POST(request: NextRequest) {
  const invalidOrigin = mutationGuard(request);
  if (invalidOrigin) return invalidOrigin;
  // The session lives only in the cookie, so dropping it is the sign-out.
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
