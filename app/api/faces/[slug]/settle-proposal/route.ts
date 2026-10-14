import type { NextRequest } from "next/server";
import { readJsonRecord } from "@/api/request";
import { readSettleProposal } from "@/api/product-face-operations";
import {
  faceContextError,
  faceResponse,
  resolveFaceRequest,
} from "@/api/product-face-server";

type Params = { params: Promise<{ slug: string }> };

// The host reads the settle proposal itself from the bound runtime (a trusted
// runtime read); the face never supplies one.
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const context = await resolveFaceRequest(request, slug, { mutation: true });
  if (!("binding" in context)) return context;
  const body = await readJsonRecord(request);
  if (!body) return faceContextError(context, "invalid_request", 400);
  try {
    const result = await readSettleProposal(context, request, body);
    if (!result.ok) {
      return faceResponse(
        context,
        {
          code: result.code,
          ...(result.reason ? { reason: result.reason } : {}),
        },
        { status: result.status, journal: result.journal },
      );
    }
    return faceResponse(
      context,
      {
        proposal: {
          proposal_id: result.proposal.proposalId,
          operation_id: result.proposal.operationId,
          object_id: result.proposal.objectId,
          action: result.proposal.action,
          input: result.proposal.input,
          proposal_hash: result.proposal.proposalHash,
          expires_at: result.proposal.expiresAt.toISOString(),
        },
        changes: result.changes,
      },
      { journal: result.journal },
    );
  } catch {
    return faceContextError(context, "upstream_unavailable", 502);
  }
}
