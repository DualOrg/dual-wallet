import type { NextRequest } from "next/server";
import { readJsonRecord } from "@/api/request";
import { readTransferProposal } from "@/api/product-face-transfer";
import {
  faceContextError,
  faceResponse,
  resolveFaceRequest,
} from "@/api/product-face-server";

type Params = { params: Promise<{ slug: string }> };

// G8 (contract r16 transfer.sign): the host reads the next transfer step
// itself from the bound runtime (a trusted runtime read); the face never
// supplies a step, a proposal or a recipient.
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const context = await resolveFaceRequest(request, slug, {
    mutation: true,
    route: "transfer-proposal",
  });
  if (!("binding" in context)) return context;
  const body = await readJsonRecord(request);
  if (!body) return faceContextError(context, "invalid_request", 400);
  try {
    const result = await readTransferProposal(context, request, body);
    if (!result.ok) {
      return faceResponse(
        context,
        { code: result.code },
        { status: result.status, journal: result.journal },
      );
    }
    const { proposal } = result;
    return faceResponse(
      context,
      {
        proposal: {
          step: proposal.step,
          proposal_id: proposal.proposalId,
          offer_id: proposal.offerId,
          object_id: proposal.objectId,
          action: proposal.action,
          input: proposal.input,
          proposal_hash: proposal.proposalHash,
          expires_at: proposal.expiresAt.toISOString(),
          recipient: proposal.recipient,
        },
      },
      { journal: result.journal },
    );
  } catch {
    return faceContextError(context, "upstream_unavailable", 502);
  }
}
