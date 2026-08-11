import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiErrorResponse, tenantRequired } from "@/api/request";
import { tenantFromRequest } from "@/api/tenant";
import { getWalletsApi } from "@/api/web-sdk-client";

export async function GET(request: NextRequest) {
  if (!tenantFromRequest(request)) return tenantRequired();
  try {
    const options = await getWalletsApi().passkeyRegisterOptions({
      cache: "no-store",
    });
    return NextResponse.json(options, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error, "We could not start passkey registration.");
  }
}
