import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  FACE_HANDOVER_TASKS,
  isFaceHandoverTicket,
  writeFaceHandover,
  type FaceHandoverKind,
} from "@/api/face-handover";
import { productFaceBinding } from "@/api/product-face-registry";
import { readJsonRecord, validRequestOrigin } from "@/api/request";
import {
  clearSessionCookie,
  currentWallet,
  readSession,
  sessionIdHash,
  withSessionId,
  writeSession,
} from "@/api/server-session";

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
 *
 * Signed in, the ticket is sealed with this session's {walletId, sidHash}, so
 * no other account or session can ever take it. Signed out, it is anonymous
 * until a sign-in binds it. A session that cannot be read now refuses rather
 * than store an unbound ticket next to it.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  if (!validRequestOrigin(request)) return refuse("invalid_origin", 403);
  const binding = productFaceBinding(slug);
  if (!binding?.handover.enabled) return refuse("handover_unavailable", 404);
  const body = await readJsonRecord(request);
  // {ticket} is a registration handover (r14); {ticket, kind: "accept"} a G8
  // transfer acceptance (r16), redeemed on the accept task.
  const keys = body ? Object.keys(body).sort().join(",") : "";
  if (
    !body ||
    (keys !== "ticket" &&
      !(keys === "kind,ticket" && body.kind === "accept")) ||
    !isFaceHandoverTicket(body.ticket)
  ) {
    return refuse("invalid_request", 400);
  }
  const kind: FaceHandoverKind = body.kind === "accept" ? "accept" : "handover";
  const response = NextResponse.json(
    { next: `/products/${binding.slug}${FACE_HANDOVER_TASKS[kind]}` },
    { headers: NO_STORE },
  );
  if (!readSession(request)) {
    writeFaceHandover(
      response,
      binding.slug,
      body.ticket,
      null,
      Date.now(),
      kind,
    );
    return response;
  }
  const session = await currentWallet(request);
  if (session.status === "unavailable") {
    return refuse("temporarily_unavailable", 503);
  }
  if (session.status === "expired") {
    // The session is over: this is a signed-out arrival.
    clearSessionCookie(response);
    writeFaceHandover(
      response,
      binding.slug,
      body.ticket,
      null,
      Date.now(),
      kind,
    );
    return response;
  }
  // Keep a renewed session (and a session id given to an older cookie).
  const state = withSessionId(session.state);
  writeSession(response, state);
  writeFaceHandover(
    response,
    binding.slug,
    body.ticket,
    { walletId: session.wallet.id, sidHash: sessionIdHash(state)! },
    Date.now(),
    kind,
  );
  return response;
}
