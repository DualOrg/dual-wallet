import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Language } from "@/api/web-sdk/models/Language";
import { establishSession } from "@/api/server-session";
import { tenantFromRequest } from "@/api/tenant";
import {
  apiErrorResponse,
  mutationGuard,
  optionalString,
  readJsonRecord,
  requiredSecret,
  requiredString,
  tenantRequired,
} from "@/api/request";
import { getWalletsApi } from "@/api/web-sdk-client";
import { toViewerWallet } from "@/app/_adapters/wallet";
import { isValidNewPassword } from "@/app/_domain/password";

export async function POST(request: NextRequest) {
  const invalidOrigin = mutationGuard(request);
  if (invalidOrigin) return invalidOrigin;
  const tenant = tenantFromRequest(request);
  if (!tenant) return tenantRequired();
  const body = await readJsonRecord(request);
  const email = body && requiredString(body, "email", 320);
  const password = body && requiredSecret(body, "password", 72);
  const nickname = body && optionalString(body, "nickname", 255);
  if (!email || !password || !isValidNewPassword(password)) {
    return NextResponse.json(
      {
        message:
          "Enter a valid email and a password between 8 characters and 72 bytes.",
      },
      { status: 400 },
    );
  }

  try {
    const login = await getWalletsApi().registerWallet(
      {
        walletCreate: {
          organizationId: tenant.organizationId,
          email,
          password,
          nickname,
          language: Language.En,
        },
      },
      { cache: "no-store" },
    );
    const response = NextResponse.json({
      authenticated: true,
      needsVerification: !login.wallet.emailVerified,
      wallet: toViewerWallet(login.wallet),
    });
    response.headers.set("Cache-Control", "private, no-store");
    if (!establishSession(response, login, tenant, "email", true)) {
      return NextResponse.json(
        { message: "The account was created outside this organization." },
        { status: 403 },
      );
    }
    return response;
  } catch (error) {
    return apiErrorResponse(error, "We could not create your account.");
  }
}
