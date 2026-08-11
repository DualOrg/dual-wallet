import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiErrorResponse, tenantRequired } from "@/api/request";
import { tenantFromRequest } from "@/api/tenant";
import { getWalletsApi } from "@/api/web-sdk-client";

async function loginOptions(request: NextRequest) {
  if (!tenantFromRequest(request)) return tenantRequired();
  try {
    const options = await getWalletsApi().passkeyLoginOptions(
      {},
      { cache: "no-store" },
    );
    return NextResponse.json(options, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiErrorResponse(
      error,
      "We could not start passkey authentication.",
    );
  }
}

// POST mirrors api-v3. GET remains supported for direct navigation and for
// cached Viewer clients that previously requested this BFF route without an
// explicit method.
export const GET = loginOptions;
export const POST = loginOptions;
