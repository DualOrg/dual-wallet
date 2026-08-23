import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  mutationGuard,
  optionalString,
  readJsonRecord,
  requiredString,
  tenantRequired,
} from "@/api/request";
import { currentWallet, writeSession } from "@/api/server-session";
import { tenantFromRequest } from "@/api/tenant";
import { getWalletsApi } from "@/api/web-sdk-client";

// Verification arrives two ways, and only one of them has a session.
//
// Someone already signed in types the code from the mail, and their address
// comes from the API rather than the request so it cannot be pointed at another
// account. Someone following the link in the mail may be in any browser at all
// — that is the point of a link — so that path carries its own address and
// organization and requires no session.
//
// The API scopes the code to the wallet the address resolves to, so neither
// path can activate an account other than the one the code was issued for.
export async function POST(request: NextRequest) {
  const invalidOrigin = mutationGuard(request);
  if (invalidOrigin) return invalidOrigin;

  const tenant = tenantFromRequest(request);
  if (!tenant) return tenantRequired();

  const body = await readJsonRecord(request);
  const code = body && requiredString(body, "code", 64);
  if (!code) {
    return NextResponse.json(
      { message: "Verification code is required." },
      { status: 400 },
    );
  }

  const linkEmail = body && optionalString(body, "email", 320);
  // The link's organization wins over the host's: one wallet hostname serves
  // several organizations, so the host cannot say which account this is.
  const organizationId =
    (body && optionalString(body, "organization_id", 24)) ??
    tenant.organizationId;

  if (linkEmail) {
    try {
      await getWalletsApi().verifyWallet(
        { verifyIn: { code, email: linkEmail, organizationId } },
        { cache: "no-store" },
      );
      return NextResponse.json({ ok: true });
    } catch (error) {
      return apiErrorResponse(
        error,
        "The verification code is invalid or has expired.",
      );
    }
  }

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

  try {
    await getWalletsApi().verifyWallet(
      { verifyIn: { code, email: current.wallet.email, organizationId } },
      { cache: "no-store" },
    );
    // Re-read so the session carries the activated flag the page renders from.
    const verified = await currentWallet(request);
    if (verified.status !== "active") {
      return NextResponse.json({ ok: true });
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
