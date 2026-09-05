import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Language } from "@/api/web-sdk/models/Language";
import { establishSession } from "@/api/server-session";
import { tenantFromRequest } from "@/api/tenant";
import {
  apiErrorResponse,
  mutationGuard,
  optionalBoolean,
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
  const challenge = body && requiredString(body, "challenge", 512);
  const signature = body && requiredString(body, "signature", 512);
  const remember = body ? (optionalBoolean(body, "remember") ?? false) : false;
  if (!challenge || !signature) {
    return NextResponse.json(
      { message: "Wallet signature is required." },
      { status: 400 },
    );
  }

  try {
    const login = await getWalletsApi().connectEoa(
      {
        eoaIn: {
          organizationId: tenant.organizationId,
          auth: { challenge, signature },
          language: Language.En,
        },
      },
      { cache: "no-store" },
    );
    const response = NextResponse.json({
      authenticated: true,
      wallet: toViewerWallet(login.wallet),
    });
    response.headers.set("Cache-Control", "private, no-store");
    if (!establishSession(response, login, tenant, "eoa", remember)) {
      return NextResponse.json(
        { message: "This wallet belongs to another organization." },
        { status: 403 },
      );
    }
    return response;
  } catch (error) {
    return apiErrorResponse(
      error,
      "The wallet signature could not be verified.",
    );
  }
}
