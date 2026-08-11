import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { establishSession } from "@/api/server-session";
import { tenantFromRequest } from "@/api/tenant";
import {
  apiErrorResponse,
  mutationGuard,
  readJsonRecord,
  requiredString,
  tenantRequired,
} from "@/api/request";
import { getWalletsApi } from "@/api/web-sdk-client";
import { toViewerWallet } from "@/app/_domain/wallet";

export async function POST(request: NextRequest) {
  const invalidOrigin = mutationGuard(request);
  if (invalidOrigin) return invalidOrigin;
  const tenant = tenantFromRequest(request);
  if (!tenant) return tenantRequired();
  const body = await readJsonRecord(request);
  const email = body && requiredString(body, "email", 320);
  const password = body && requiredString(body, "password", 255);
  if (!email || !password) {
    return NextResponse.json(
      { message: "Email and password are required." },
      { status: 400 },
    );
  }

  try {
    const login = await getWalletsApi().loginWallet(
      {
        loginIn: {
          organizationId: tenant.organizationId,
          email,
          password,
        },
      },
      { cache: "no-store" },
    );
    const response = NextResponse.json({
      authenticated: true,
      wallet: toViewerWallet(login.wallet),
    });
    response.headers.set("Cache-Control", "private, no-store");
    if (!establishSession(response, login, tenant)) {
      return NextResponse.json(
        { message: "This account belongs to another organization." },
        { status: 403 },
      );
    }
    return response;
  } catch (error) {
    return apiErrorResponse(
      error,
      "We could not sign you in with those details.",
    );
  }
}
