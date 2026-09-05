import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { parsePasskeyRegistration } from "@/api/passkey";
import {
  apiErrorResponse,
  mutationGuard,
  readJsonRecord,
  tenantRequired,
} from "@/api/request";
import { establishSession } from "@/api/server-session";
import { tenantFromRequest } from "@/api/tenant";
import { Language } from "@/api/web-sdk/models/Language";
import { getWalletsApi } from "@/api/web-sdk-client";
import { toViewerWallet } from "@/app/_adapters/wallet";

export async function POST(request: NextRequest) {
  const invalidOrigin = mutationGuard(request);
  if (invalidOrigin) return invalidOrigin;
  const tenant = tenantFromRequest(request);
  if (!tenant) return tenantRequired();
  const body = await readJsonRecord(request);
  const credential =
    body && parsePasskeyRegistration(body, tenant.organizationId, Language.En);
  if (!credential) {
    return NextResponse.json(
      { message: "Invalid passkey response." },
      { status: 400 },
    );
  }
  try {
    const login = await getWalletsApi().passkeyRegisterVerify(
      { passkeyRegisterVerifyIn: credential },
      { cache: "no-store" },
    );
    const response = NextResponse.json({
      authenticated: true,
      wallet: toViewerWallet(login.wallet),
    });
    response.headers.set("Cache-Control", "private, no-store");
    if (!establishSession(response, login, tenant, "passkey", true)) {
      return NextResponse.json(
        { message: "The passkey was created outside this organization." },
        { status: 403 },
      );
    }
    return response;
  } catch (error) {
    return apiErrorResponse(error, "The passkey could not be registered.");
  }
}
