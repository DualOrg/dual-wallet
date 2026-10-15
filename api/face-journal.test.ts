/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from "next/server";
import {
  faceJournalCookieName,
  MAX_FACE_LAUNCHES,
  readFaceHistory,
  readFaceJournal,
  writeFaceJournal,
  type FaceJournalOwner,
  type FaceJournalScope,
} from "@/api/face-journal";
import { sealForPurpose } from "@/api/server-session";

const owner = { sidHash: "sid-1", walletId: "wallet-1" };
const launchA = "launch-aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const launchB = "launch-bbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const scope = (launchId = launchA): FaceJournalScope => ({
  owner,
  launchId,
  slug: "morrow-home",
  programmeId: "morrow-home-arc",
});
const entry = {
  operationId: "register-op-0001",
  kind: "registration" as const,
  operation: "registration.submit",
  slug: "morrow-home",
  programmeId: "morrow-home-arc",
  objectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
  phase: "assertion_issued" as const,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  issuedAt: Date.now(),
};

const emptyRequest = () =>
  new NextRequest("http://localhost/api/faces/x/operations");

function sealed(launchId = launchA, request = emptyRequest()) {
  const response = NextResponse.json({});
  writeFaceJournal(response, request, scope(launchId), {
    entries: [entry],
    selections: [],
    mints: [Date.now() + 30_000],
  });
  return response.cookies.get(faceJournalCookieName(launchId))!;
}

const requestWith = (cookies: Record<string, string>) =>
  new NextRequest("http://localhost/api/faces/x/operations", {
    headers: {
      cookie: Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; "),
    },
  });

describe("face operation journal cookie (per launch)", () => {
  it("is host-only, HttpOnly and SameSite=Strict, and holds no secrets", () => {
    const cookie = sealed();
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      path: "/",
    });
    expect(cookie).not.toHaveProperty("domain");
    expect(cookie.value).not.toContain("register-op-0001");
    expect(
      readFaceJournal(requestWith({ [cookie.name]: cookie.value }), scope())
        .entries,
    ).toEqual([entry]);
  });

  it("keeps two launches apart: neither overwrites nor reads the other", () => {
    const a = sealed(launchA);
    const request = requestWith({ [a.name]: a.value });
    const response = NextResponse.json({});
    writeFaceJournal(response, request, scope(launchB), {
      entries: [],
      selections: [],
      mints: [],
    });
    // Launch B's write sets only its own cookie and leaves A's alone.
    expect(response.cookies.get(a.name)).toBeUndefined();
    const b = response.cookies.get(faceJournalCookieName(launchB))!;
    const both = requestWith({ [a.name]: a.value, [b.name]: b.value });
    expect(readFaceJournal(both, scope(launchA)).entries).toEqual([entry]);
    expect(readFaceJournal(both, scope(launchB)).entries).toEqual([]);
    // A's sealed value renamed to B's cookie does not open as B.
    expect(
      readFaceJournal(requestWith({ [b.name]: a.value }), scope(launchB))
        .entries,
    ).toEqual([]);
  });

  it("reads as empty for another session, wallet or face", () => {
    const cookie = sealed();
    const request = requestWith({ [cookie.name]: cookie.value });
    for (const other of [
      { ...scope(), owner: { ...owner, sidHash: "sid-2" } },
      { ...scope(), owner: { ...owner, walletId: "wallet-2" } },
      { ...scope(), slug: "tidewell" },
    ]) {
      expect(readFaceJournal(request, other).entries).toEqual([]);
    }
  });

  it("rejects tampering and values sealed for another purpose", () => {
    const cookie = sealed();
    const tampered = `${cookie.value.slice(0, -2)}${cookie.value.endsWith("A") ? "B" : "A"}`;
    expect(
      readFaceJournal(requestWith({ [cookie.name]: tampered }), scope())
        .entries,
    ).toEqual([]);
    const otherPurpose = sealForPurpose("dual-other", {
      v: 2,
      sid: owner.sidHash,
      wallet: owner.walletId,
      launch: launchA,
      slug: "morrow-home",
      programme: "morrow-home-arc",
      entries: [entry],
    });
    expect(
      readFaceJournal(requestWith({ [cookie.name]: otherPurpose }), scope())
        .entries,
    ).toEqual([]);
  });

  it("drops expired assertion mints from the outstanding count", () => {
    const response = NextResponse.json({});
    writeFaceJournal(response, emptyRequest(), scope(), {
      entries: [],
      selections: [],
      mints: [Date.now() - 1, Date.now() + 30_000],
    });
    const cookie = response.cookies.get(faceJournalCookieName(launchA))!;
    const journal = readFaceJournal(
      requestWith({ [cookie.name]: cookie.value }),
      scope(),
    );
    expect(journal.mints).toHaveLength(1);
  });

  it(`keeps at most ${MAX_FACE_LAUNCHES} launches and drops unreadable ones`, () => {
    const cookies: Record<string, string> = {};
    for (let index = 0; index < MAX_FACE_LAUNCHES + 1; index += 1) {
      const launchId = `launch-${String(index).repeat(28).slice(0, 28)}`;
      const response = NextResponse.json({});
      writeFaceJournal(
        response,
        emptyRequest(),
        scope(launchId),
        { entries: [], selections: [], mints: [] },
        1_000 + index,
      );
      const cookie = response.cookies.get(faceJournalCookieName(launchId))!;
      cookies[cookie.name] = cookie.value;
    }
    cookies[faceJournalCookieName("launch-garbagegarbagegarbagegarbage")] =
      "not-sealed";
    const response = NextResponse.json({});
    writeFaceJournal(
      response,
      requestWith(cookies),
      scope("launch-newnewnewnewnewnewnewnewnewnew"),
      { entries: [], selections: [], mints: [] },
      9_999,
    );
    const cleared = response.cookies
      .getAll()
      .filter((cookie) => cookie.value === "")
      .map((cookie) => cookie.name)
      .sort();
    // The two oldest launches and the unreadable one are dropped; three
    // others plus the new one remain.
    expect(cleared).toEqual(
      [
        faceJournalCookieName("launch-0000000000000000000000000000"),
        faceJournalCookieName("launch-1111111111111111111111111111"),
        faceJournalCookieName("launch-garbagegarbagegarbagegarbage"),
      ].sort(),
    );
  });
});

describe("registration history (another launch of the same wallet)", () => {
  const earlierSession = { sidHash: "sid-1", walletId: "wallet-1" };
  const laterSession = { sidHash: "sid-2", walletId: "wallet-1" };
  const launchC = "launch-cccccccccccccccccccccccccccc";
  const scoped = (
    who: FaceJournalOwner,
    launchId: string,
    slug = "morrow-home",
    programmeId = "morrow-home-arc",
  ): FaceJournalScope => ({ owner: who, launchId, slug, programmeId });

  function sealedFor(
    who: FaceJournalOwner,
    launchId: string,
    entries = [entry],
    now = Date.now(),
  ) {
    const response = NextResponse.json({});
    writeFaceJournal(
      response,
      emptyRequest(),
      scoped(who, launchId),
      { entries, selections: [], mints: [] },
      now,
    );
    return response.cookies.get(faceJournalCookieName(launchId))!;
  }

  it("finds exactly the named operation in this wallet's earlier session, read-only", () => {
    const earlier = sealedFor(earlierSession, launchA);
    const request = requestWith({ [earlier.name]: earlier.value });
    // The later session's own journal for that launch would be empty.
    expect(
      readFaceJournal(request, scoped(laterSession, launchA)).entries,
    ).toEqual([]);
    expect(
      readFaceHistory(
        request,
        scoped(laterSession, launchB),
        entry.operationId,
      ),
    ).toEqual([entry]);
    // Only that operation, never a listing.
    expect(
      readFaceHistory(
        request,
        scoped(laterSession, launchB),
        "register-op-0002",
      ),
    ).toEqual([]);
  });

  it("gives nothing to another wallet, face or programme, to the launch itself, or to a renamed, tampered or foreign value", () => {
    const earlier = sealedFor(earlierSession, launchA);
    const request = requestWith({ [earlier.name]: earlier.value });
    for (const other of [
      scoped({ ...laterSession, walletId: "wallet-2" }, launchB),
      scoped(laterSession, launchB, "tidewell"),
      scoped(laterSession, launchB, "morrow-home", "morrow-home-other"),
      // That launch's own cookie is its journal, not history.
      scoped(laterSession, launchA),
    ]) {
      expect(readFaceHistory(request, other, entry.operationId)).toEqual([]);
    }
    const tampered = `${earlier.value.slice(0, -2)}${earlier.value.endsWith("A") ? "B" : "A"}`;
    for (const cookies of [
      // A's sealed value under launch C's name does not open as C.
      { [faceJournalCookieName(launchC)]: earlier.value },
      { [earlier.name]: tampered },
      {
        [earlier.name]: sealForPurpose("dual-other", {
          v: 2,
          sid: earlierSession.sidHash,
          wallet: earlierSession.walletId,
          launch: launchA,
          slug: "morrow-home",
          programme: "morrow-home-arc",
          entries: [entry],
        }),
      },
    ]) {
      expect(
        readFaceHistory(
          requestWith(cookies),
          scoped(laterSession, launchB),
          entry.operationId,
        ),
      ).toEqual([]);
    }
  });

  it("keeps this wallet's earlier registration history through the next session's writes, as it was; drops another wallet's and history-less ones", () => {
    const history = sealedFor(earlierSession, launchA, [entry], 1_000);
    const empty = sealedFor(earlierSession, launchB, [], 1_001);
    const foreign = sealedFor(
      { sidHash: "sid-1", walletId: "wallet-2" },
      launchC,
      [entry],
      1_002,
    );
    const response = NextResponse.json({});
    writeFaceJournal(
      response,
      requestWith({
        [history.name]: history.value,
        [empty.name]: empty.value,
        [foreign.name]: foreign.value,
      }),
      scoped(laterSession, "launch-newnewnewnewnewnewnewnewnewnew"),
      { entries: [], selections: [], mints: [] },
      2_000,
    );
    // Kept: not set at all (neither deleted nor re-sealed).
    expect(response.cookies.get(history.name)).toBeUndefined();
    expect(
      response.cookies
        .getAll()
        .filter((cookie) => cookie.value === "")
        .map((cookie) => cookie.name)
        .sort(),
    ).toEqual([empty.name, foreign.name].sort());
  });

  it(`still keeps at most ${MAX_FACE_LAUNCHES} launches, the oldest history dropped first`, () => {
    const cookies: Record<string, string> = {};
    const names: string[] = [];
    for (let index = 0; index < MAX_FACE_LAUNCHES; index += 1) {
      const launchId = `launch-${String(index).repeat(28).slice(0, 28)}`;
      const cookie = sealedFor(
        earlierSession,
        launchId,
        [entry],
        1_000 + index,
      );
      cookies[cookie.name] = cookie.value;
      names.push(cookie.name);
    }
    const response = NextResponse.json({});
    writeFaceJournal(
      response,
      requestWith(cookies),
      scoped(laterSession, "launch-newnewnewnewnewnewnewnewnewnew"),
      { entries: [], selections: [], mints: [] },
      9_999,
    );
    expect(
      response.cookies
        .getAll()
        .filter((cookie) => cookie.value === "")
        .map((cookie) => cookie.name),
    ).toEqual([names[0]]);
  });
});
