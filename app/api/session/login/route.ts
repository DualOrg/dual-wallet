import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { establishSession } from "@/api/server-session";
import { tenantFromRequest } from "@/api/tenant";
import {
  apiErrorResponse,
  mutationGuard,
  optionalString,
  readJsonRecord,
  requiredString,
  tenantRequired,
} from "@/api/request";
import { getWalletsApi } from "@/api/web-sdk-client";
import { toViewerWallet } from "@/app/_adapters/wallet";

export async function POST(request: NextRequest) {
  const invalidOrigin = mutationGuard(request);
  if (invalidOrigin) return invalidOrigin;
  const tenant = tenantFromRequest(request);
  if (!tenant) return tenantRequired();
  const body = await readJsonRecord(request);
  const email = body && requiredString(body, "email", 320);
  // A password and a one-time code are alternatives, not a pair: the code is
  // what someone signs in with when they cannot use the password, so requiring
  // both would close the door this exists to open.
  const password = body ? optionalString(body, "password", 255) : undefined;
  const otp = body ? optionalString(body, "otp", 64) : undefined;
  if (!email || (!password && !otp)) {
    return NextResponse.json(
      {
        message: "Email and either a password or a sign-in code are required.",
      },
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
          otp,
        },
      },
      { cache: "no-store" },
    );
    const response = NextResponse.json({
      authenticated: true,
      wallet: toViewerWallet(login.wallet),
    });
    response.headers.set("Cache-Control", "private, no-store");
    if (!establishSession(response, login, tenant, "email")) {
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
