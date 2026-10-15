import type { NextRequest } from "next/server";
import {
  faceContextError,
  faceResponse,
  publicUnitFacts,
  readPublicUnit,
  resolveFaceRequest,
} from "@/api/product-face-server";
import { isObjectId } from "@/app/_domain/product-face";

type Params = { params: Promise<{ slug: string; objectId: string }> };

// Canonical facts for the host's own registration confirmation, from the
// PUBLIC projection: the unit is not yet held by this wallet.
export async function GET(request: NextRequest, { params }: Params) {
  const { slug, objectId } = await params;
  const context = await resolveFaceRequest(request, slug, {
    route: "units",
  });
  if (!("binding" in context)) return context;
  if (!isObjectId(objectId)) {
    return faceContextError(context, "invalid_request", 400);
  }
  try {
    const unit = await readPublicUnit(objectId);
    if (!unit) return faceContextError(context, "not_found", 404);
    const facts = publicUnitFacts(context, unit);
    if (!context.binding.templateIds.includes(facts.templateId)) {
      return faceContextError(context, "not_in_programme", 404);
    }
    return faceResponse(context, { unit: facts });
  } catch {
    return faceContextError(context, "upstream_unavailable", 502);
  }
}
