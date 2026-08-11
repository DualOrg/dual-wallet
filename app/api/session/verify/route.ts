import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  mutationGuard,
  readJsonRecord,
  requiredString,
  tenantRequired,
} from "@/api/request";
import { refreshCurrentWallet, requestSession } from "@/api/server-session";
import { tenantFromRequest } from "@/api/tenant";
import { getWalletsApi } from "@/api/web-sdk-client";

export async function POST(request: NextRequest) {
  const invalidOrigin = mutationGuard(request);
  if (invalidOrigin) return invalidOrigin;
  if (!tenantFromRequest(request)) return tenantRequired();
  const session = requestSession(request);
  if (!session) {
    return NextResponse.json(
      { message: "Sign in to verify this account." },
      { status: 401 },
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
      { verifyIn: { code, email: session.record.wallet.email } },
      { cache: "no-store" },
    );
    const wallet = await refreshCurrentWallet(request);
    if (!wallet?.activated) {
      return NextResponse.json(
        { message: "This code does not belong to the current account." },
        { status: 403 },
      );
    }
    return NextResponse.json({ ok: true, wallet });
  } catch (error) {
    return apiErrorResponse(
      error,
      "The verification code is invalid or has expired.",
    );
  }
}
