import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { tenantFromRequest } from "@/api/tenant";
import { apiErrorResponse, tenantRequired } from "@/api/request";
import { getWalletsApi } from "@/api/web-sdk-client";

export async function GET(request: NextRequest) {
  if (!tenantFromRequest(request)) return tenantRequired();
  try {
    const challenge = await getWalletsApi().getAuthChallenge({
      cache: "no-store",
    });
    return NextResponse.json(
      {
        challenge: challenge.challenge,
        expiresAt: challenge.expiresAt.toISOString(),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error, "We could not start wallet authentication.");
  }
}
