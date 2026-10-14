import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isFaceHandoverTicket, writeFaceHandover } from "@/api/face-handover";
import { productFaceBinding } from "@/api/product-face-registry";
import { readJsonRecord, validRequestOrigin } from "@/api/request";

type Params = { params: Promise<{ slug: string }> };

const NO_STORE = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};

const refuse = (code: string, status: number) =>
  NextResponse.json(
    { code, message: code.replaceAll("_", " ") },
    { status, headers: NO_STORE },
  );

/**
 * POST /api/faces/[slug]/handover (contract r14). Signed-out allowed: the
 * wallet's handover entry hands over the face runtime's one-time ticket. Only
 * a registry slug whose binding enables handover stores anything; the ticket
 * goes into the sealed pre-auth cookie and the answer names only where to go
 * next (the register task; the request proxy sends a signed-out visitor
 * through sign-in with the validated return path).
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  if (!validRequestOrigin(request)) return refuse("invalid_origin", 403);
  const binding = productFaceBinding(slug);
  if (!binding?.handover.enabled) return refuse("handover_unavailable", 404);
  const body = await readJsonRecord(request);
  if (
    !body ||
    Object.keys(body).length !== 1 ||
    !isFaceHandoverTicket(body.ticket)
  ) {
    return refuse("invalid_request", 400);
  }
  const response = NextResponse.json(
    { next: `/products/${binding.slug}/register` },
    { headers: NO_STORE },
  );
  writeFaceHandover(response, binding.slug, body.ticket);
  return response;
}
