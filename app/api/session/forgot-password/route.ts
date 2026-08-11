import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { tenantFromRequest } from "@/api/tenant";
import {
  apiErrorResponse,
  mutationGuard,
  readJsonRecord,
  requiredString,
  tenantRequired,
} from "@/api/request";
import { getWalletsApi } from "@/api/web-sdk-client";

export async function POST(request: NextRequest) {
  const invalidOrigin = mutationGuard(request);
  if (invalidOrigin) return invalidOrigin;
  const tenant = tenantFromRequest(request);
  if (!tenant) return tenantRequired();
  const body = await readJsonRecord(request);
  const email = body && requiredString(body, "email", 320);
  if (!email) {
    return NextResponse.json(
      { message: "Email is required." },
      { status: 400 },
    );
  }

  try {
    await getWalletsApi().resetPassword(
      { resetPasswordIn: { email, orgId: tenant.organizationId } },
      { cache: "no-store" },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "We could not start password recovery.");
  }
}
