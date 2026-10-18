import type { NextRequest } from "next/server";
import { keepFaceAcceptance } from "@/api/face-acceptance";
import {
  applyFaceHandoverRead,
  faceHandoverKindOfTask,
  readFaceHandover,
} from "@/api/face-handover";
import { launchCapacity, withSelection } from "@/api/face-journal";
import { verifyFaceArtifact } from "@/api/face-artifact";
import { discoverPinnedLaunches } from "@/api/product-face-recovery";
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
  const context = await resolveFaceRequest(request, slug, {
    route: "context",
  });
  if (!("binding" in context)) return context;
  const artifact = await verifyFaceArtifact(context.binding);
  if (!artifact.ok) {
    return faceContextError(
      context,
      artifact.reason,
      artifact.reason === "artifact_mismatch" ? 409 : 503,
    );
  }
  // A new launch the budget would open read-only because other launches of
  // this wallet hold runtime writes whose only correlation is their cookie:
  // one read-only listing of the runtimes first. When it durably discovers
  // them (contract r20 §2), this launch records them found and keeps its
  // own cookie, and only a launch whose writes are then all discoverable
  // makes room (api/face-journal.ts). Otherwise it stays read-only exactly
  // as before. Nothing is resolved, re-sent or acknowledged here.
  let journal = context.journal;
  let capacity = context.capacity;
  if (capacity === "read_only") {
    const found = await discoverPinnedLaunches(context, request).catch(
      () => [],
    );
    if (found.length > 0) {
      journal = { ...journal, found };
      capacity = launchCapacity(request, context.scope, Date.now(), found);
    }
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
  // A branded host hands over no ticket for a journey it does not serve. A
  // read-only launch (launch_capacity on its writes) consumes none either:
  // it could not redeem it, so the one-time ticket stays bound to the
  // session for a launch that can, within its own lifetime.
  const taskKind =
    handoverKind &&
    capacity === "full" &&
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
      journal: withSelection(journal, { slug, cleared: true }),
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
