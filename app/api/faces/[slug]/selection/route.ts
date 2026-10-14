import type { NextRequest } from "next/server";
import { readJsonRecord } from "@/api/request";
import { selectProduct } from "@/api/product-face-operations";
import {
  faceContextError,
  faceResponse,
  resolveFaceRequest,
} from "@/api/product-face-server";

type Params = { params: Promise<{ slug: string }> };

// Records the selected product server-side. A new selection replaces the old
// one, so nothing is minted for a previous product's context afterwards.
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const context = await resolveFaceRequest(request, slug, { mutation: true });
  if (!("binding" in context)) return context;
  const body = await readJsonRecord(request);
  if (!body) return faceContextError(context, "invalid_request", 400);
  try {
    const result = await selectProduct(context, body);
    if (!result.ok) {
      return faceResponse(
        context,
        { code: result.code },
        { status: result.status, journal: result.journal },
      );
    }
    return faceResponse(
      context,
      {
        context_id: result.contextId,
        product: result.product
          ? {
              object_id: result.product.objectId,
              template_id: result.product.templateId,
              name: result.product.name,
              image_url: result.product.imageUrl ?? null,
              owner: result.product.owner,
              custom: result.product.custom,
              when_modified: result.product.modifiedAt.toISOString(),
            }
          : null,
      },
      { journal: result.journal },
    );
  } catch {
    return faceContextError(context, "upstream_unavailable", 502);
  }
}
