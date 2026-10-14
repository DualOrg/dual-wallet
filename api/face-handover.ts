import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import { sealForPurpose, unsealForPurpose } from "@/api/server-session";

// contract r14 faceEnabledHandover: the one-time handover ticket the face
// runtime minted travels from the wallet's handover entry, through sign-in,
// to the register task in ONE short-lived pre-auth cookie. It is sealed
// (AES-256-GCM, purpose-bound), HttpOnly, Secure in production, host-only and
// SameSite=Strict, and lives at most ten minutes. The ticket is never logged,
// put in a URL or kept anywhere else; the context read on the register task
// takes it exactly once.
//
// Account isolation is enforced HERE, on the server, never by the client's
// best-effort deletion: a ticket stored while signed in is sealed with that
// session's {walletId, sidHash}; one stored signed out is anonymous until a
// sign-in binds it to the account that signed in. It is handed over only to
// a session whose walletId and sidHash equal its binding; on any mismatch it
// is cleared and nothing is handed over.

const isProduction = process.env.NODE_ENV === "production";
const PURPOSE = "dual-face-handover-v2";

export const FACE_HANDOVER_COOKIE = isProduction
  ? "__Host-dual_face_handover"
  : "dual_face_handover";
export const FACE_HANDOVER_TTL_SECONDS = 10 * 60;
/** An opaque runtime ticket (32 random bytes, encoded); nothing is parsed. */
export const FACE_HANDOVER_TICKET = /^[A-Za-z0-9_-]{32,256}$/;
export const FACE_HANDOVER_TASK = "/register";

/** The authenticated session a ticket belongs to. */
export interface FaceHandoverOwner {
  walletId: string;
  sidHash: string;
}

interface SealedHandover {
  v: 2;
  slug: string;
  ticket: string;
  exp: number;
  /** null: stored signed out, not yet bound to an account. */
  owner: FaceHandoverOwner | null;
}

export type FaceHandoverInspection =
  | { state: "none" }
  | { state: "invalid" }
  | { state: "valid"; entry: SealedHandover };

function cookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict" as const,
    path: "/",
    ...(maxAge === undefined ? { expires: new Date(0) } : { maxAge }),
  };
}

const ownerValid = (value: unknown): value is FaceHandoverOwner =>
  Boolean(value) &&
  typeof value === "object" &&
  typeof (value as FaceHandoverOwner).walletId === "string" &&
  (value as FaceHandoverOwner).walletId.length > 0 &&
  typeof (value as FaceHandoverOwner).sidHash === "string" &&
  (value as FaceHandoverOwner).sidHash.length > 0;

export function sameFaceHandoverOwner(
  a: FaceHandoverOwner | null,
  b: FaceHandoverOwner | null,
) {
  return Boolean(
    a && b && a.walletId === b.walletId && a.sidHash === b.sidHash,
  );
}

export function isFaceHandoverTicket(value: unknown): value is string {
  return typeof value === "string" && FACE_HANDOVER_TICKET.test(value);
}

function seal(response: NextResponse, entry: SealedHandover, now = Date.now()) {
  const maxAge = Math.max(1, Math.floor((entry.exp - now) / 1000));
  response.cookies.set(
    FACE_HANDOVER_COOKIE,
    sealForPurpose(PURPOSE, entry),
    cookieOptions(Math.min(maxAge, FACE_HANDOVER_TTL_SECONDS)),
  );
}

/**
 * Stores the ticket for this slug, replacing any earlier handover. `owner`
 * is the signed-in session's identity, or null when signed out.
 */
export function writeFaceHandover(
  response: NextResponse,
  slug: string,
  ticket: string,
  owner: FaceHandoverOwner | null,
  now = Date.now(),
) {
  seal(
    response,
    {
      v: 2,
      slug,
      ticket,
      exp: now + FACE_HANDOVER_TTL_SECONDS * 1000,
      owner: owner
        ? { walletId: owner.walletId, sidHash: owner.sidHash }
        : null,
    },
    now,
  );
}

export function clearFaceHandover(response: NextResponse) {
  response.cookies.set(FACE_HANDOVER_COOKIE, "", cookieOptions());
}

/** The pending handover as sent: none, unusable (clear it), or valid. */
export function inspectFaceHandover(
  request: NextRequest,
  now = Date.now(),
): FaceHandoverInspection {
  const value = request.cookies.get(FACE_HANDOVER_COOKIE)?.value;
  if (!value) return { state: "none" };
  if (value.length > 1024) return { state: "invalid" };
  const opened = unsealForPurpose(PURPOSE, value) as
    Partial<SealedHandover> | undefined;
  if (
    !opened ||
    typeof opened !== "object" ||
    opened.v !== 2 ||
    typeof opened.slug !== "string" ||
    !isFaceHandoverTicket(opened.ticket) ||
    typeof opened.exp !== "number" ||
    opened.exp <= now ||
    !(opened.owner === null || ownerValid(opened.owner))
  ) {
    return { state: "invalid" };
  }
  return { state: "valid", entry: opened as SealedHandover };
}

export type FaceHandoverRead = {
  /** Present only when it is handed over now. */
  ticket?: string;
  /** Clear the cookie in this response. */
  clear: boolean;
  /** Rewrite it bound to this owner in this response (first authenticated read). */
  bind?: SealedHandover;
  /** Another account's ticket: refused (and cleared). */
  refused?: boolean;
};

/**
 * The authenticated context read for `slug` by the session `owner`.
 * - Another account's or session's ticket (any slug) is refused and cleared.
 * - An unusable cookie (tampered, expired, malformed) is cleared.
 * - Another programme's own ticket is left alone.
 * - On the register task (`consume`), this account's or an anonymous ticket
 *   for this slug is handed over and cleared in the same response.
 * - Otherwise an anonymous ticket is bound to this session (first
 *   authenticated read) and kept for the register task.
 */
export function readFaceHandover(
  request: NextRequest,
  slug: string,
  owner: FaceHandoverOwner,
  { consume }: { consume: boolean },
  now = Date.now(),
): FaceHandoverRead {
  const found = inspectFaceHandover(request, now);
  if (found.state === "none") return { clear: false };
  if (found.state === "invalid") return { clear: true };
  const { entry } = found;
  if (entry.owner && !sameFaceHandoverOwner(entry.owner, owner)) {
    return { clear: true, refused: true };
  }
  if (entry.slug !== slug) return { clear: false };
  if (consume) return { ticket: entry.ticket, clear: true };
  return entry.owner
    ? { clear: false }
    : { clear: false, bind: { ...entry, owner } };
}

/** Writes a read's outcome to the response. */
export function applyFaceHandoverRead(
  response: NextResponse,
  read: FaceHandoverRead,
  now = Date.now(),
) {
  if (read.clear) clearFaceHandover(response);
  else if (read.bind) seal(response, read.bind, now);
}

/**
 * A new session was just established for `owner` (sign-in, registration,
 * passkey or EOA). A pending anonymous ticket becomes this account's; one
 * bound to the same wallet follows the new session; one bound to another
 * account, or an unusable cookie, is cleared now, whatever the client does.
 */
export function bindFaceHandoverToSession(
  request: NextRequest,
  response: NextResponse,
  owner: FaceHandoverOwner,
  now = Date.now(),
) {
  const found = inspectFaceHandover(request, now);
  if (found.state === "none") return;
  if (found.state === "invalid") {
    clearFaceHandover(response);
    return;
  }
  const { entry } = found;
  if (entry.owner && entry.owner.walletId !== owner.walletId) {
    clearFaceHandover(response);
    return;
  }
  seal(response, { ...entry, owner: { ...owner } }, now);
}
