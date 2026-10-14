import type { NextRequest } from "next/server";
import { readJsonRecord } from "@/api/request";
import { transferStepProgress } from "@/api/product-face-transfer";
import {
  faceContextError,
  faceResponse,
  resolveFaceRequest,
} from "@/api/product-face-server";

type Params = { params: Promise<{ slug: string }> };

// G8: after a submitted transfer step, the host verifies it (with the
// holder's recorded action) or reads its status at the runtime, read-only.
// It never executes or re-reserves anything.
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const context = await resolveFaceRequest(request, slug, { mutation: true });
  if (!("binding" in context)) return context;
  const body = await readJsonRecord(request);
  if (!body) return faceContextError(context, "invalid_request", 400);
  try {
    const result = await transferStepProgress(context, request, body);
    if (!result.ok) {
      return faceResponse(
        context,
        { code: result.code },
        { status: result.status, journal: result.journal },
      );
    }
    return faceResponse(
      context,
      { status: result.progress.status, step: result.progress.step },
      { journal: result.journal },
    );
  } catch {
    return faceContextError(context, "upstream_unavailable", 502);
  }
}
