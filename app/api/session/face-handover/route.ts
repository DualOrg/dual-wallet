import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clearFaceHandover } from "@/api/face-handover";
import { mutationGuard } from "@/api/request";

// An account change drops any pending face handover (contract r14): a ticket
// carried in for one account is never handed to another. Logout clears it in
// the logout route itself.
export async function DELETE(request: NextRequest) {
  const invalidOrigin = mutationGuard(request);
  if (invalidOrigin) return invalidOrigin;
  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
  clearFaceHandover(response);
  return response;
}
