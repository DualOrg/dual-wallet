import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  accessTokenForRequest,
  copyUpstreamHeaders,
  upstreamUrl,
} from "@/api/server-session";
import { mutationGuard } from "@/api/request";

export async function POST(request: NextRequest) {
  const invalidOrigin = mutationGuard(request);
  if (invalidOrigin) return invalidOrigin;
  const accessToken = await accessTokenForRequest(request);
  if (!accessToken) {
    return NextResponse.json(
      { message: "Sign in to request a new code." },
      { status: 401 },
    );
  }

  // api-v3 currently marks this operation public, while the backend correctly
  // requires the current wallet. Keep the workaround isolated to this route.
  const upstream = await fetch(upstreamUrl("auth/verification-code"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    cache: "no-store",
  });
  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: copyUpstreamHeaders(upstream),
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
