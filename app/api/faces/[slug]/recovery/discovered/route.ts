import type { NextRequest } from "next/server";
import { applyDiscovery } from "@/api/product-face-recovery";
import {
  faceContextError,
  faceResponse,
  resolveFaceRequest,
} from "@/api/product-face-server";
import { readJsonRecord } from "@/api/request";

type Params = { params: Promise<{ slug: string }> };

// PROPOSED contract r20, not deployed: the host hands back the discovery
// tickets a complete listing issued in this launch; the BFF marks the named
// held runtime writes discoverable against this launch's journal as it is
// now (api/face-journal.ts: that launch cookie becomes expendable). Nothing
// is sent to any runtime. A read-only launch holds nothing to mark and is
// refused like every journal-writing request.
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const context = await resolveFaceRequest(request, slug, {
    mutation: true,
    route: "recovery",
  });
  if (!("binding" in context)) return context;
  const body = await readJsonRecord(request);
  if (!body) return faceContextError(context, "invalid_request", 400);
  const result = applyDiscovery(context, body);
  if (!result.ok) return faceContextError(context, result.code, result.status);
  return faceResponse(
    context,
    { marked: result.marked },
    { journal: result.journal },
  );
}
