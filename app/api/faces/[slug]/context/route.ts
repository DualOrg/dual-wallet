import type { NextRequest } from "next/server";
import {
  clearFaceHandover,
  FACE_HANDOVER_TASK,
  readFaceHandover,
} from "@/api/face-handover";
import { withSelection } from "@/api/face-journal";
import { verifyFaceArtifact } from "@/api/face-artifact";
import { toProductFaceApplication } from "@/api/product-face-registry";
import {
  faceContextError,
  faceResponse,
  resolveFaceRequest,
} from "@/api/product-face-server";
import { isTaskPath } from "@/app/_domain/product-face";

type Params = { params: Promise<{ slug: string }> };

// Server-authorised programme context. The pinned artifact is verified here,
// before the browser renders any frame, and a new host starts with no
// selected product.
export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const context = await resolveFaceRequest(request, slug);
  if (!("binding" in context)) return context;
  const artifact = await verifyFaceArtifact(context.binding);
  if (!artifact.ok) {
    return faceContextError(
      context,
      artifact.reason,
      artifact.reason === "artifact_mismatch" ? 409 : 503,
    );
  }
  // contract r14: on the register task the context read takes a pending
  // face handover for this programme exactly once (the cookie is cleared in
  // this response); the host hands it to the face in its initialize context.
  const task = request.nextUrl.searchParams.get("task");
  const onRegisterTask =
    isTaskPath(task) &&
    task === FACE_HANDOVER_TASK &&
    context.binding.handover.enabled;
  const handover = onRegisterTask
    ? readFaceHandover(request, context.binding.slug)
    : { clear: false };
  const response = faceResponse(
    context,
    {
      application: toProductFaceApplication(context.binding),
      frameUrl: `${context.binding.origin}${context.binding.path}`,
      ...(handover.ticket ? { handover: { ticket: handover.ticket } } : {}),
    },
    {
      journal: withSelection(context.journal, { slug, cleared: true }),
    },
  );
  if (handover.clear) clearFaceHandover(response);
  return response;
}
