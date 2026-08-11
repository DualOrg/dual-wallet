import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clearSessionCookie, terminateSession } from "@/api/server-session";
import { mutationGuard } from "@/api/request";

export async function POST(request: NextRequest) {
  const invalidOrigin = mutationGuard(request);
  if (invalidOrigin) return invalidOrigin;
  terminateSession(request);
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
