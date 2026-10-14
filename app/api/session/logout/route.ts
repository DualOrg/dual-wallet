import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clearFaceAcceptance } from "@/api/face-acceptance";
import { clearFaceHandover } from "@/api/face-handover";
import { clearFaceJournal } from "@/api/face-journal";
import { clearSessionCookie, revokeSession } from "@/api/server-session";
import { mutationGuard } from "@/api/request";

export async function POST(request: NextRequest) {
  const invalidOrigin = mutationGuard(request);
  if (invalidOrigin) return invalidOrigin;
  // End the session on the API first, then drop the cookie. The cookie holds
  // the only copy of the refresh token, so clearing it first would leave a
  // session alive upstream with nothing left to name it.
  await revokeSession(request);
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  // The product-face journal is bound to this session; end it with it.
  clearFaceJournal(response, request);
  // A pending face handover (contract r14) never outlives a sign-out.
  clearFaceHandover(response);
  // Nor does a kept transfer acceptance (proposed r19).
  clearFaceAcceptance(response);
  return response;
}
