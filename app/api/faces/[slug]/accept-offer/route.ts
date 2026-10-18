import type { NextRequest } from "next/server";
import { bindFaceAcceptanceUnit } from "@/api/face-acceptance";
import { readJsonRecord } from "@/api/request";
import { readAcceptOffer } from "@/api/product-face-transfer";
import {
  faceContextError,
  faceResponse,
  resolveFaceRequest,
} from "@/api/product-face-server";

type Params = { params: Promise<{ slug: string }> };

// r19: the recipient's host reads which unit this launch's acceptance
// is for (the runtime's transfer.acceptance.read, server to server, then
// Dual's public projection) for its own transfer.accept confirmation, and
// binds that unit to the kept acceptance: a transfer.accept assertion is then
// minted only for exactly it. The face never supplies the product.
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const context = await resolveFaceRequest(request, slug, {
    mutation: true,
    route: "accept-offer",
  });
  if (!("binding" in context)) return context;
  const body = await readJsonRecord(request);
  if (!body) return faceContextError(context, "invalid_request", 400);
  try {
    const result = await readAcceptOffer(context, request, body);
    if (!result.ok) {
      return faceResponse(
        context,
        { code: result.code },
        { status: result.status, journal: result.journal },
      );
    }
    const response = faceResponse(
      context,
      { unit: result.unit },
      { journal: result.journal },
    );
    bindFaceAcceptanceUnit(response, result.acceptance, result.unit.objectId);
    return response;
  } catch {
    return faceContextError(context, "upstream_unavailable", 502);
  }
}
