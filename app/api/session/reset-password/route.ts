import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  mutationGuard,
  readJsonRecord,
  requiredSecret,
  requiredString,
  tenantRequired,
} from "@/api/request";
import { tenantFromRequest } from "@/api/tenant";
import { getWalletsApi } from "@/api/web-sdk-client";
import { isValidNewPassword } from "@/app/_domain/password";

export async function POST(request: NextRequest) {
  const invalidOrigin = mutationGuard(request);
  if (invalidOrigin) return invalidOrigin;
  if (!tenantFromRequest(request)) return tenantRequired();
  const body = await readJsonRecord(request);
  const token = body && requiredString(body, "token", 512);
  const password = body && requiredSecret(body, "password", 72);
  if (!token || !password || !isValidNewPassword(password)) {
    return NextResponse.json(
      { message: "A valid reset token and password are required." },
      { status: 400 },
    );
  }

  try {
    await getWalletsApi().setNewPassword(
      { setNewPasswordIn: { token, newPassword: password } },
      { cache: "no-store" },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "The reset link is invalid or has expired.");
  }
}
