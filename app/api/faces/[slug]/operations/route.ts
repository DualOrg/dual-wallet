import type { NextRequest } from "next/server";
import { readJsonRecord } from "@/api/request";
import { transitionOperation } from "@/api/product-face-operations";
import {
  faceContextError,
  faceResponse,
  resolveFaceRequest,
} from "@/api/product-face-server";
import type { FaceJournalEntry } from "@/app/_domain/product-face-journal";

type Params = { params: Promise<{ slug: string }> };

function wireEntry(entry: FaceJournalEntry) {
  return {
    operation_id: entry.operationId,
    kind: entry.kind,
    operation: entry.operation,
    object_id: entry.objectId,
    case_id: entry.caseId ?? null,
    phase: entry.phase,
    status: entry.status ?? null,
    action_id: entry.actionId ?? null,
  };
}

export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const context = await resolveFaceRequest(request, slug);
  if (!("binding" in context)) return context;
  return faceResponse(context, {
    operations: context.journal.entries
      .filter((entry) => entry.slug === slug)
      .map(wireEntry),
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const context = await resolveFaceRequest(request, slug, { mutation: true });
  if (!("binding" in context)) return context;
  const body = await readJsonRecord(request);
  if (!body) return faceContextError(context, "invalid_request", 400);
  try {
    const result = await transitionOperation(context, request, body);
    if (!result.ok) {
      return faceResponse(
        context,
        { code: result.code },
        { status: result.status, journal: result.journal },
      );
    }
    return faceResponse(
      context,
      {
        operation: wireEntry(result.entry),
        unit: result.unit ?? null,
        quote: result.quote
          ? {
              case_id: result.quote.caseId,
              quote_version: result.quote.quoteVersion,
              provider: result.quote.provider,
              amount: result.quote.amount,
              currency: result.quote.currency,
            }
          : null,
      },
      { journal: result.journal },
    );
  } catch {
    return faceContextError(context, "upstream_unavailable", 502);
  }
}
