import type { NextRequest } from "next/server";
import { listRecovery } from "@/api/product-face-recovery";
import {
  faceContextError,
  faceResponse,
  resolveFaceRequest,
} from "@/api/product-face-server";

type Params = { params: Promise<{ slug: string }> };

// PROPOSED contract r20, not deployed: this wallet's own unresolved and
// unacknowledged operations, listed from the face's runtime and its linked
// runtime without a cookie or a remembered unit, each resolved read-only
// through its kind's existing resolver. Nothing is re-sent or executed. This
// launch's journal is written here only to mark a held runtime write the
// runtime listed as discoverable (api/face-journal.ts).
export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const context = await resolveFaceRequest(request, slug, {
    route: "recovery",
  });
  if (!("binding" in context)) return context;
  try {
    // A sealed continuation from this launch's previous page, if any.
    const continuation =
      request.nextUrl.searchParams.get("continuation") ?? undefined;
    const listing = await listRecovery(context, request, continuation);
    if ("ok" in listing) {
      return faceContextError(context, listing.code, listing.status);
    }
    return faceResponse(
      context,
      {
        supported: listing.supported,
        complete: listing.complete,
        withheld: listing.withheld,
        unchecked: listing.unchecked,
        continuation: listing.continuation,
        items: listing.items.map((item) => ({
          operation_id: item.operationId,
          kind: item.kind,
          operation: item.operation,
          object_id: item.objectId,
          case_id: item.caseId,
          offer_id: item.offerId,
          step: item.step,
          outcome: item.outcome,
          ticket: item.ticket,
        })),
      },
      {
        journal:
          listing.journal === context.journal ? undefined : listing.journal,
      },
    );
  } catch {
    return faceContextError(context, "upstream_unavailable", 502);
  }
}
