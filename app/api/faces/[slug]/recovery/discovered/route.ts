import type { NextRequest } from "next/server";
import { launchCapacity } from "@/api/face-journal";
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
// now (api/face-journal.ts: that launch cookie becomes expendable), and
// records another launch's named write found in this launch's journal
// (FaceJournal.found). Nothing is sent to any runtime. A read-only launch
// holds nothing of its own to mark; it reaches here so that what it found
// can count, and its journal is persisted only when, with that counted, the
// budget then makes room without dropping a launch holding a write's only
// correlation (api/face-journal.ts writeFaceJournal); otherwise nothing is
// kept and nothing is marked.
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const context = await resolveFaceRequest(request, slug, {
    mutation: true,
    journals: false,
    route: "recovery",
  });
  if (!("binding" in context)) return context;
  const body = await readJsonRecord(request);
  if (!body) return faceContextError(context, "invalid_request", 400);
  const result = applyDiscovery(context, body);
  if (!result.ok) return faceContextError(context, result.code, result.status);
  const kept =
    result.journal !== undefined &&
    launchCapacity(request, context.scope, Date.now(), result.journal.found) ===
      "full";
  return faceResponse(
    context,
    { marked: kept ? result.marked : 0 },
    kept ? { journal: result.journal } : {},
  );
}
