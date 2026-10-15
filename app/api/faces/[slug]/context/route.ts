import type { NextRequest } from "next/server";
import { keepFaceAcceptance } from "@/api/face-acceptance";
import {
  applyFaceHandoverRead,
  faceHandoverKindOfTask,
  readFaceHandover,
} from "@/api/face-handover";
import { withSelection } from "@/api/face-journal";
import { verifyFaceArtifact } from "@/api/face-artifact";
import { toProductFaceApplication } from "@/api/product-face-registry";
import { hostJourneyEnabled } from "@/api/wallet-host";
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
  // Only this session's own (or a still anonymous) ticket is ever handed
  // over; another account's is cleared here and nothing is handed over.
  // G8: the same for a transfer acceptance ticket on the accept task.
  const task = request.nextUrl.searchParams.get("task");
  const handoverKind =
    isTaskPath(task) && context.binding.handover.enabled
      ? faceHandoverKindOfTask(task)
      : undefined;
  // A branded host hands over no ticket for a journey it does not serve.
  const taskKind =
    handoverKind &&
    hostJourneyEnabled(handoverKind === "accept" ? "transfer" : "registration")
      ? handoverKind
      : undefined;
  const handover = readFaceHandover(
    request,
    context.binding.slug,
    context.owner,
    { consume: taskKind ?? false },
  );
  const response = faceResponse(
    context,
    {
      application: toProductFaceApplication(context.binding),
      frameUrl: `${context.binding.origin}${context.binding.path}`,
      ...(handover.ticket
        ? handover.kind === "accept"
          ? { acceptance: { ticket: handover.ticket } }
          : { handover: { ticket: handover.ticket } }
        : {}),
    },
    {
      journal: withSelection(context.journal, { slug, cleared: true }),
    },
  );
  applyFaceHandoverRead(response, handover);
  // r19: the BFF keeps the acceptance ticket it hands this launch's
  // face, sealed and bound to the launch and session, to read which unit it is
  // for (transfer.acceptance.read) and name it in the wallet's confirmation.
  if (handover.ticket && handover.kind === "accept") {
    keepFaceAcceptance(response, {
      slug: context.binding.slug,
      launchId: context.scope.launchId,
      ticket: handover.ticket,
      owner: context.owner,
    });
  }
  return response;
}
