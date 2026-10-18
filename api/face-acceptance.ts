import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import { sealForPurpose, unsealForPurpose } from "@/api/server-session";
import {
  FACE_HANDOVER_TTL_SECONDS,
  isFaceHandoverTicket,
  type FaceHandoverOwner,
} from "@/api/face-handover";

// Contract r19 (accept names the product): the acceptance ticket the
// context read handed ONE launch's face on its accept task is also kept here,
// by the BFF only, in a sealed (AES-256-GCM, purpose-bound), HttpOnly,
// SameSite=Strict, host-only cookie bound to that launch, slug and session
// (walletId, sidHash), for at most the ticket's own ten minutes. The BFF reads
// with it, server to server, which unit the acceptance is for
// (transfer.acceptance.read), names that unit from Dual's public projection
// in the wallet's own confirmation, and binds it here; a transfer.accept
// assertion is then minted only for exactly that unit. The ticket is never
// put in a response, a URL or the face again.

const isProduction = process.env.NODE_ENV === "production";
const PURPOSE = "dual-face-acceptance-v1";
const OBJECT_ID = /^[a-f0-9]{24}$/;

export const FACE_ACCEPTANCE_COOKIE = isProduction
  ? "__Host-dual_face_acceptance"
  : "dual_face_acceptance";

export interface FaceAcceptance {
  v: 1;
  slug: string;
  launchId: string;
  ticket: string;
  owner: FaceHandoverOwner;
  exp: number;
  /** The unit the runtime named for this ticket, once the BFF read it. */
  objectId?: string;
}

function cookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict" as const,
    path: "/",
    ...(maxAge === undefined ? { expires: new Date(0) } : { maxAge }),
  };
}

function seal(response: NextResponse, entry: FaceAcceptance, now: number) {
  const maxAge = Math.max(1, Math.floor((entry.exp - now) / 1000));
  response.cookies.set(
    FACE_ACCEPTANCE_COOKIE,
    sealForPurpose(PURPOSE, entry),
    cookieOptions(Math.min(maxAge, FACE_HANDOVER_TTL_SECONDS)),
  );
}

/** Keeps the acceptance ticket handed to this launch's face (accept task only). */
export function keepFaceAcceptance(
  response: NextResponse,
  entry: {
    slug: string;
    launchId: string;
    ticket: string;
    owner: FaceHandoverOwner;
  },
  now = Date.now(),
) {
  if (!isFaceHandoverTicket(entry.ticket)) return;
  seal(
    response,
    {
      v: 1,
      slug: entry.slug,
      launchId: entry.launchId,
      ticket: entry.ticket,
      owner: { walletId: entry.owner.walletId, sidHash: entry.owner.sidHash },
      exp: now + FACE_HANDOVER_TTL_SECONDS * 1000,
    },
    now,
  );
}

/** Records the unit the runtime named for this acceptance (same expiry). */
export function bindFaceAcceptanceUnit(
  response: NextResponse,
  entry: FaceAcceptance,
  objectId: string,
  now = Date.now(),
) {
  if (!OBJECT_ID.test(objectId)) return;
  seal(response, { ...entry, objectId }, now);
}

export function clearFaceAcceptance(response: NextResponse) {
  response.cookies.set(FACE_ACCEPTANCE_COOKIE, "", cookieOptions());
}

/**
 * This launch's acceptance, only for the same slug, launch and session, and
 * unexpired; anything else (none, tampered, another launch, account or
 * session) is no acceptance.
 */
export function readFaceAcceptance(
  request: NextRequest,
  expected: { slug: string; launchId: string; owner: FaceHandoverOwner },
  now = Date.now(),
): FaceAcceptance | undefined {
  const value = request.cookies.get(FACE_ACCEPTANCE_COOKIE)?.value;
  if (!value || value.length > 1024) return undefined;
  const opened = unsealForPurpose(PURPOSE, value) as
    Partial<FaceAcceptance> | undefined;
  if (
    !opened ||
    typeof opened !== "object" ||
    opened.v !== 1 ||
    opened.slug !== expected.slug ||
    opened.launchId !== expected.launchId ||
    !isFaceHandoverTicket(opened.ticket) ||
    typeof opened.exp !== "number" ||
    opened.exp <= now ||
    !opened.owner ||
    opened.owner.walletId !== expected.owner.walletId ||
    opened.owner.sidHash !== expected.owner.sidHash ||
    (opened.objectId !== undefined && !OBJECT_ID.test(opened.objectId))
  ) {
    return undefined;
  }
  return opened as FaceAcceptance;
}
