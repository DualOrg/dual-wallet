import type { NextRequest } from "next/server";
import { reconcileOperation } from "@/api/product-face-operations";
import {
  faceContextError,
  faceResponse,
  resolveFaceRequest,
} from "@/api/product-face-server";
import { isOperationId } from "@/app/_domain/product-face";

type Params = { params: Promise<{ slug: string; operationId: string }> };

// Read-only reconciliation: journal + the wallet's own canonical readback,
// and, for a registration this launch issued, the runtime's own status read
// for that one operation (never a dispatch).
export async function GET(request: NextRequest, { params }: Params) {
  const { slug, operationId } = await params;
  const context = await resolveFaceRequest(request, slug);
  if (!("binding" in context)) return context;
  if (!isOperationId(operationId)) {
    return faceContextError(context, "invalid_request", 400);
  }
  try {
    const result = await reconcileOperation(context, request, operationId);
    if (!result.ok)
      return faceContextError(context, result.code, result.status);
    return faceResponse(
      context,
      {
        operation_id: result.entry.operationId,
        kind: result.entry.kind,
        phase: result.entry.phase,
        status: result.status,
        object_id: result.entry.objectId,
        readback: result.readback
          ? {
              owner_is_you: result.readback.ownerIsYou,
              state: result.readback.state,
            }
          : null,
      },
      { journal: result.journal },
    );
  } catch {
    return faceContextError(context, "upstream_unavailable", 502);
  }
}
