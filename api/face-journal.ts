import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import { sealForPurpose, unsealForPurpose } from "@/api/server-session";
import {
  parseJournalEntry,
  pruneJournal,
  type FaceJournalEntry,
} from "@/app/_domain/product-face-journal";
import { isObjectId } from "@/app/_domain/product-face";

const isProduction = process.env.NODE_ENV === "production";
const PURPOSE = "dual-face-journal-v1";
const CONTEXT_ID = /^[A-Za-z0-9_-]{16,64}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;
const MAX_SELECTIONS = 8;

/**
 * Outstanding (unexpired) assertions this browser session may hold. A client
 * side bound only: the runtime's one-time `jti` consumption is the guarantee,
 * and an already-minted assertion cannot be revoked at the runtime.
 */
export const MAX_OUTSTANDING_ASSERTIONS = 10;

export const FACE_JOURNAL_COOKIE = isProduction
  ? "__Host-dual_face_journal"
  : "dual_face_journal";

export interface FaceSelection {
  slug: string;
  objectId: string;
  contextId: string;
  at: number;
}

export interface FaceJournal {
  entries: FaceJournalEntry[];
  selections: FaceSelection[];
  /** Expiry times (ms) of assertions minted for this session. */
  mints: number[];
}

export interface FaceJournalOwner {
  sidHash: string;
  walletId: string;
}

interface SealedJournal extends FaceJournal {
  v: 1;
  sid: string;
  wallet: string;
}

export const emptyFaceJournal = (): FaceJournal => ({
  entries: [],
  selections: [],
  mints: [],
});

function parseSelection(value: unknown): FaceSelection | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const item = value as Record<string, unknown>;
  if (
    typeof item.slug !== "string" ||
    !SLUG.test(item.slug) ||
    !isObjectId(item.objectId) ||
    typeof item.contextId !== "string" ||
    !CONTEXT_ID.test(item.contextId) ||
    typeof item.at !== "number" ||
    !Number.isSafeInteger(item.at)
  ) {
    return undefined;
  }
  return {
    slug: item.slug,
    objectId: item.objectId,
    contextId: item.contextId,
    at: item.at,
  };
}

/**
 * Reads the journal bound to this session and wallet. A journal sealed for a
 * different session or wallet — after logout, expiry or an account change —
 * reads as empty and is replaced on the next write.
 */
export function readFaceJournal(
  request: NextRequest,
  owner: FaceJournalOwner,
  now = Date.now(),
): FaceJournal {
  const cookie = request.cookies.get(FACE_JOURNAL_COOKIE)?.value;
  if (!cookie || cookie.length > 8192) return emptyFaceJournal();
  const value = unsealForPurpose(PURPOSE, cookie);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyFaceJournal();
  }
  const sealed = value as Partial<SealedJournal>;
  if (
    sealed.v !== 1 ||
    sealed.sid !== owner.sidHash ||
    sealed.wallet !== owner.walletId ||
    !Array.isArray(sealed.entries)
  ) {
    return emptyFaceJournal();
  }
  return {
    entries: pruneJournal(
      sealed.entries
        .map(parseJournalEntry)
        .filter((entry): entry is FaceJournalEntry => entry !== undefined),
      now,
    ),
    selections: Array.isArray(sealed.selections)
      ? sealed.selections
          .map(parseSelection)
          .filter((item): item is FaceSelection => item !== undefined)
          .slice(-MAX_SELECTIONS)
      : [],
    mints: Array.isArray(sealed.mints)
      ? sealed.mints.filter(
          (expiry): expiry is number =>
            typeof expiry === "number" && expiry > now,
        )
      : [],
  };
}

export function writeFaceJournal(
  response: NextResponse,
  owner: FaceJournalOwner,
  journal: FaceJournal,
) {
  const sealed: SealedJournal = {
    v: 1,
    sid: owner.sidHash,
    wallet: owner.walletId,
    entries: journal.entries,
    selections: journal.selections.slice(-MAX_SELECTIONS),
    mints: journal.mints,
  };
  response.cookies.set(FACE_JOURNAL_COOKIE, sealForPurpose(PURPOSE, sealed), {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
  });
}

export function clearFaceJournal(response: NextResponse) {
  response.cookies.set(FACE_JOURNAL_COOKIE, "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
  });
}

export function currentSelection(journal: FaceJournal, slug: string) {
  return journal.selections.find((selection) => selection.slug === slug);
}

export function withSelection(
  journal: FaceJournal,
  selection: FaceSelection | { slug: string; cleared: true },
): FaceJournal {
  const others = journal.selections.filter(
    (item) => item.slug !== selection.slug,
  );
  return {
    ...journal,
    selections: "cleared" in selection ? others : [...others, selection],
  };
}
