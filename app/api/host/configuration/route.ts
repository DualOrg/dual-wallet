import { NextResponse } from "next/server";
import { hostReadback } from "@/api/wallet-host";

export const dynamic = "force-dynamic";

/**
 * GET /api/host/configuration: the public readback of this deployment's host
 * configuration status and engine identity. Answered in every state (absent,
 * invalid, active), on any address, with no secret.
 */
export function GET() {
  return NextResponse.json(hostReadback(), {
    headers: { "Cache-Control": "no-store" },
  });
}
