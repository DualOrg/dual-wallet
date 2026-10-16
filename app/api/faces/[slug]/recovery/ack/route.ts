import type { NextRequest } from "next/server";
import { acknowledgeRecoveredOutcome } from "@/api/product-face-recovery";
import {
  faceContextError,
  faceResponse,
  resolveFaceRequest,
} from "@/api/product-face-server";
import { readJsonRecord } from "@/api/request";

type Params = { params: Promise<{ slug: string }> };

// PROPOSED contract r20, not deployed: the host records at the runtime,
// idempotently, that it delivered one proved outcome (the ticket a complete
// listing issued in this launch). The business record is never modified.
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const context = await resolveFaceRequest(request, slug, {
    mutation: true,
    route: "recovery-ack",
  });
  if (!("binding" in context)) return context;
  const body = await readJsonRecord(request);
  if (!body) return faceContextError(context, "invalid_request", 400);
  try {
    const result = await acknowledgeRecoveredOutcome(context, request, body);
    if (!result.ok) {
      return faceContextError(context, result.code, result.status);
    }
    return faceResponse(context, { acknowledged: true, first: result.first });
  } catch {
    return faceContextError(context, "upstream_unavailable", 502);
  }
}
