import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  mutationGuard,
  readJsonRecord,
  requiredString,
  tenantRequired,
} from "@/api/request";
import { currentWallet, writeSession } from "@/api/server-session";
import { tenantFromRequest } from "@/api/tenant";
import { getWalletsApi } from "@/api/web-sdk-client";

export async function POST(request: NextRequest) {
  const invalidOrigin = mutationGuard(request);
  if (invalidOrigin) return invalidOrigin;
  if (!tenantFromRequest(request)) return tenantRequired();
  // The email comes from the API rather than the cookie so it cannot go stale.
  const current = await currentWallet(request);
  if (current.status === "expired") {
    return NextResponse.json(
      { message: "Sign in to verify this account." },
      { status: 401 },
    );
  }
  if (current.status === "unavailable") {
    return NextResponse.json(
      { message: "The smart object service is temporarily unavailable." },
      { status: 503 },
    );
  }
  const body = await readJsonRecord(request);
  const code = body && requiredString(body, "code", 64);
  if (!code) {
    return NextResponse.json(
      { message: "Verification code is required." },
      { status: 400 },
    );
  }

  try {
    await getWalletsApi().verifyWallet(
      { verifyIn: { code, email: current.wallet.email } },
      { cache: "no-store" },
    );
    const verified = await currentWallet(request);
    if (verified.status !== "active" || !verified.wallet.activated) {
      return NextResponse.json(
        { message: "This code does not belong to the current account." },
        { status: 403 },
      );
    }
    const response = NextResponse.json({ ok: true, wallet: verified.wallet });
    writeSession(response, verified.state);
    return response;
  } catch (error) {
    return apiErrorResponse(
      error,
      "The verification code is invalid or has expired.",
    );
  }
}
