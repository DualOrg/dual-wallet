import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import { sealForPurpose, unsealForPurpose } from "@/api/server-session";

// contract r14 faceEnabledHandover: the one-time handover ticket the face
// runtime minted travels from the wallet's handover entry, through sign-in,
// to the register task in ONE short-lived pre-auth cookie. It is sealed
// (AES-256-GCM, purpose-bound to the slug), HttpOnly, Secure in production,
// host-only and SameSite=Strict, and lives at most ten minutes. The ticket is
// never logged, put in a URL or kept anywhere else; the context read on the
// register task takes it exactly once.

const isProduction = process.env.NODE_ENV === "production";
const PURPOSE = "dual-face-handover-v1";

export const FACE_HANDOVER_COOKIE = isProduction
  ? "__Host-dual_face_handover"
  : "dual_face_handover";
export const FACE_HANDOVER_TTL_SECONDS = 10 * 60;
/** An opaque runtime ticket (32 random bytes, encoded); nothing is parsed. */
export const FACE_HANDOVER_TICKET = /^[A-Za-z0-9_-]{32,256}$/;
export const FACE_HANDOVER_TASK = "/register";

interface SealedHandover {
  v: 1;
  slug: string;
  ticket: string;
  exp: number;
}

const purposeFor = (slug: string) => `${PURPOSE}:${slug}`;

function cookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict" as const,
    path: "/",
    ...(maxAge === undefined ? { expires: new Date(0) } : { maxAge }),
  };
}

export function isFaceHandoverTicket(value: unknown): value is string {
  return typeof value === "string" && FACE_HANDOVER_TICKET.test(value);
}

/** Stores the ticket for this slug, replacing any earlier handover. */
export function writeFaceHandover(
  response: NextResponse,
  slug: string,
  ticket: string,
  now = Date.now(),
) {
  const sealed: SealedHandover = {
    v: 1,
    slug,
    ticket,
    exp: now + FACE_HANDOVER_TTL_SECONDS * 1000,
  };
  response.cookies.set(
    FACE_HANDOVER_COOKIE,
    sealForPurpose(purposeFor(slug), sealed),
    cookieOptions(FACE_HANDOVER_TTL_SECONDS),
  );
}

export function clearFaceHandover(response: NextResponse) {
  response.cookies.set(FACE_HANDOVER_COOKIE, "", cookieOptions());
}

/**
 * Reads the pending handover for this slug. `clear` is true whenever a
 * cookie for this slug was sent (valid, expired or malformed): the caller
 * clears it in the same response, so a ticket is handed over at most once.
 * A cookie sealed for another slug does not open here and is left alone.
 */
export function readFaceHandover(
  request: NextRequest,
  slug: string,
  now = Date.now(),
): { ticket?: string; clear: boolean } {
  const value = request.cookies.get(FACE_HANDOVER_COOKIE)?.value;
  if (!value || value.length > 1024) return { clear: false };
  const opened = unsealForPurpose(purposeFor(slug), value) as
    Partial<SealedHandover> | undefined;
  if (!opened || typeof opened !== "object") return { clear: false };
  if (
    opened.v !== 1 ||
    opened.slug !== slug ||
    !isFaceHandoverTicket(opened.ticket) ||
    typeof opened.exp !== "number" ||
    opened.exp <= now
  ) {
    return { clear: true };
  }
  return { ticket: opened.ticket, clear: true };
}
