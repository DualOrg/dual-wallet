import type { NextRequest } from "next/server";
import { withSelection } from "@/api/face-journal";
import { verifyFaceArtifact } from "@/api/face-artifact";
import { toProductFaceApplication } from "@/api/product-face-registry";
import {
  faceContextError,
  faceResponse,
  resolveFaceRequest,
} from "@/api/product-face-server";

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
  return faceResponse(
    context,
    {
      application: toProductFaceApplication(context.binding),
      frameUrl: `${context.binding.origin}${context.binding.path}`,
    },
    {
      journal: withSelection(context.journal, { slug, cleared: true }),
    },
  );
}
