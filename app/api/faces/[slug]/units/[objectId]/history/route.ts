import type { NextRequest } from "next/server";
import {
  ProductHistoryUnavailable,
  readPublicProductHistory,
} from "@/api/product-history";
import {
  faceContextError,
  faceResponse,
  readPublicUnit,
  resolveFaceRequest,
} from "@/api/product-face-server";
import { isObjectId } from "@/app/_domain/product-face";

type Params = { params: Promise<{ slug: string; objectId: string }> };

// The product's own public history across every owner, for a unit of this
// face's programme (api/product-history.ts). A history that cannot be read
// exactly is unavailable, never shown in part.
export async function GET(request: NextRequest, { params }: Params) {
  const { slug, objectId } = await params;
  const context = await resolveFaceRequest(request, slug, {
    route: "history",
  });
  if (!("binding" in context)) return context;
  if (!isObjectId(objectId)) {
    return faceContextError(context, "invalid_request", 400);
  }
  try {
    const unit = await readPublicUnit(objectId);
    if (!unit) return faceContextError(context, "not_found", 404);
    if (!context.binding.templateIds.includes(unit.templateId)) {
      return faceContextError(context, "not_in_programme", 404);
    }
    const entries = await readPublicProductHistory(objectId);
    if (!entries) return faceContextError(context, "not_found", 404);
    return faceResponse(context, {
      entries: entries.map((entry) => ({
        action_id: entry.actionId,
        action: entry.action,
        status: entry.status,
        when: entry.when.toISOString(),
      })),
    });
  } catch (error) {
    return faceContextError(
      context,
      error instanceof ProductHistoryUnavailable
        ? "history_unavailable"
        : "upstream_unavailable",
      502,
    );
  }
}
