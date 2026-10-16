/**
 * @jest-environment node
 */
import { generateKeyPairSync } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_ORGANIZATION_ID } from "@/api/tenant";
import type { LoginOut } from "@/api/web-sdk/models/LoginOut";
import { bindingInput, HOLDER } from "@/test/product-face-fixtures";

// Only the route-level launch_capacity test reaches these.
const getWallet = jest.fn();
const getObjectById = jest.fn();
const getObjectByIdPublic = jest.fn();
jest.mock("@/api/web-sdk-client", () => ({
  getWalletsApi: () => ({ getWallet, logout: jest.fn() }),
  getObjectsApi: () => ({ getObjectById, getObjectByIdPublic }),
}));
jest.mock("@/api/face-artifact", () => {
  const actual = jest.requireActual("@/api/face-artifact");
  return { ...actual, verifyFaceArtifact: jest.fn() };
});

import {
  FACE_JOURNAL_COOKIE_PREFIX,
  faceJournalCookieName,
  launchWouldDropUnresolved,
  MAX_FACE_LAUNCHES,
  readFaceHistory,
  readFaceJournal,
  writeFaceJournal,
  type FaceJournalOwner,
  type FaceJournalScope,
} from "@/api/face-journal";
import { verifyFaceArtifact } from "@/api/face-artifact";
import { establishSession, sealForPurpose } from "@/api/server-session";
import type { FaceJournalEntry } from "@/app/_domain/product-face-journal";
import { GET as contextGET } from "@/app/api/faces/[slug]/context/route";
import { POST as operationsPOST } from "@/app/api/faces/[slug]/operations/route";
import { POST as assertionsPOST } from "@/app/api/faces/[slug]/assertions/route";

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
    entries: FaceJournalEntry[] = [entry],
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

  it(`still keeps at most ${MAX_FACE_LAUNCHES} launches, the oldest settled history dropped first`, () => {
    const cookies: Record<string, string> = {};
    const names: string[] = [];
    for (let index = 0; index < MAX_FACE_LAUNCHES; index += 1) {
      const launchId = `launch-${String(index).repeat(28).slice(0, 28)}`;
      // Settled since: still history a result page reads, but resolved, so
      // the budget may drop it.
      const cookie = sealedFor(
        earlierSession,
        launchId,
        [{ ...entry, phase: "settled" }],
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

// A transfer step's progress read mints, so it writes the CURRENT launch's
// journal; an earlier session's launch that holds a sent, unsettled transfer
// step is the only record of that step and must survive that write as it was.
describe("transfer history (another launch of the same wallet)", () => {
  const earlierSession = { sidHash: "sid-1", walletId: "wallet-1" };
  const laterSession = { sidHash: "sid-2", walletId: "wallet-1" };
  const step: FaceJournalEntry = {
    operationId: "xfer-0123456789abcdef",
    kind: "transfer",
    operation: "transfer.request",
    slug: "morrow-home",
    programmeId: "morrow-home-arc",
    objectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    phase: "submitted",
    proposalId: "ptp-0123456789abcdef01234567",
    offerId: "pto-0123456789abcdef01234567",
    actionId: "action-transfer-1",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const fresh = "launch-newnewnewnewnewnewnewnewnewnew";

  function sealedFor(
    who: FaceJournalOwner,
    launchId: string,
    entries: FaceJournalEntry[] = [step],
    now = Date.now(),
  ) {
    const response = NextResponse.json({});
    writeFaceJournal(
      response,
      emptyRequest(),
      {
        owner: who,
        launchId,
        slug: "morrow-home",
        programmeId: "morrow-home-arc",
      },
      { entries, selections: [], mints: [] },
      now,
    );
    return response.cookies.get(faceJournalCookieName(launchId))!;
  }

  function write(cookies: Record<string, string>, now: number) {
    const response = NextResponse.json({});
    writeFaceJournal(
      response,
      requestWith(cookies),
      { ...scope(fresh), owner: laterSession },
      { entries: [], selections: [], mints: [Date.now() + 30_000] },
      now,
    );
    return response;
  }

  it("keeps an earlier session's sent, unsettled step through the next session's writes, never naming it; drops one whose step is not sent, settled or another wallet's", () => {
    const sent = sealedFor(earlierSession, launchA, [step], 1_000);
    const confirmed = sealedFor(
      earlierSession,
      launchB,
      [{ ...step, phase: "confirmed" }],
      1_001,
    );
    const settled = sealedFor(
      earlierSession,
      "launch-cccccccccccccccccccccccccccc",
      [{ ...step, phase: "settled" }],
      1_002,
    );
    const foreign = sealedFor(
      { sidHash: "sid-1", walletId: "wallet-2" },
      "launch-dddddddddddddddddddddddddddd",
      [step],
      1_003,
    );
    // The browser's jar, updated from each response as a browser does.
    const jar: Record<string, string> = {
      [sent.name]: sent.value,
      [confirmed.name]: confirmed.value,
      [settled.name]: settled.value,
      [foreign.name]: foreign.value,
    };
    const first = write(jar, 2_000);
    // Kept: not set at all (neither deleted, re-sealed nor given an expiry).
    expect(first.cookies.get(sent.name)).toBeUndefined();
    expect(
      first.cookies
        .getAll()
        .filter((cookie) => cookie.value === "")
        .map((cookie) => cookie.name)
        .sort(),
    ).toEqual([confirmed.name, settled.name, foreign.name].sort());
    for (const cookie of first.cookies.getAll()) {
      if (cookie.value) jar[cookie.name] = cookie.value;
      else delete jar[cookie.name];
    }
    // A second write of the new launch: the sent step's launch, unchanged,
    // is still not named, and the step still reads back from it.
    const second = write(jar, 3_000);
    expect(second.cookies.get(sent.name)).toBeUndefined();
    expect(
      second.cookies.getAll().filter((cookie) => cookie.value === ""),
    ).toEqual([]);
    expect(jar[sent.name]).toBe(sent.value);
    expect(
      readFaceHistory(
        requestWith(jar),
        { ...scope(fresh), owner: laterSession },
        step.operationId,
      ),
    ).toEqual([step]);
  });

  it(`within the ${MAX_FACE_LAUNCHES}-launch budget, newer empty launches go before a sent step`, () => {
    const sent = sealedFor(earlierSession, launchA, [step], 1_000);
    const cookies: Record<string, string> = { [sent.name]: sent.value };
    const plain: string[] = [];
    for (let index = 0; index < MAX_FACE_LAUNCHES - 1; index += 1) {
      const launchId = `launch-${String(index).repeat(28).slice(0, 28)}`;
      const cookie = sealedFor(laterSession, launchId, [], 2_000 + index);
      cookies[cookie.name] = cookie.value;
      plain.push(cookie.name);
    }
    const response = write(cookies, 9_999);
    // Three kept besides the new launch: the sent step first, then the newest
    // empty ones; the oldest empty launch is dropped.
    expect(
      response.cookies
        .getAll()
        .filter((cookie) => cookie.value === "")
        .map((cookie) => cookie.name),
    ).toEqual([plain[0]]);
    expect(response.cookies.get(sent.name)).toBeUndefined();
  });
});

// A launch cookie can hold the wallet's only record that authority left it
// and the outcome is unknown: an issued registration, a sent transfer step,
// or an issued runtime write (Warranty & Service, transfer offer/cancel).
// The four-launch budget never drops such a cookie; a launch that would need
// that is refused (launch_capacity) before any work.
describe("unresolved evidence is never dropped by the launch budget", () => {
  const earlierSession = { sidHash: "sid-1", walletId: "wallet-1" };
  const laterSession = { sidHash: "sid-2", walletId: "wallet-1" };
  const fresh = "launch-newnewnewnewnewnewnewnewnewnew";
  const runtimeWrite: FaceJournalEntry = {
    operationId: "runtime-op-0001",
    kind: "runtime",
    operation: "case.open",
    slug: "morrow-home",
    programmeId: "morrow-home-arc",
    objectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    phase: "assertion_issued",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    issuedAt: Date.now(),
  };
  const sentStep: FaceJournalEntry = {
    operationId: "xfer-0123456789abcdef",
    kind: "transfer",
    operation: "transfer.request",
    slug: "morrow-home",
    programmeId: "morrow-home-arc",
    objectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    phase: "submitted",
    proposalId: "ptp-0123456789abcdef01234567",
    offerId: "pto-0123456789abcdef01234567",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const launch = (index: number) => `launch-${String(index).padStart(28, "0")}`;

  function sealedFor(
    who: FaceJournalOwner,
    launchId: string,
    entries: FaceJournalEntry[],
    now: number,
  ) {
    const response = NextResponse.json({});
    writeFaceJournal(
      response,
      emptyRequest(),
      { ...scope(launchId), owner: who },
      { entries, selections: [], mints: [] },
      now,
    );
    return response.cookies.get(faceJournalCookieName(launchId))!;
  }

  const freshScope = (who: FaceJournalOwner = laterSession) => ({
    ...scope(fresh),
    owner: who,
  });

  function writeFresh(cookies: Record<string, string>, now = 9_999) {
    const response = NextResponse.json({});
    writeFaceJournal(
      response,
      requestWith(cookies),
      freshScope(),
      { entries: [], selections: [], mints: [] },
      now,
    );
    return response.cookies
      .getAll()
      .filter((cookie) => cookie.value === "")
      .map((cookie) => cookie.name)
      .sort();
  }

  it("keeps an issued runtime write across an earlier session and ranks it as evidence, ahead of newer unfinished and empty launches", () => {
    const jar: Record<string, string> = {};
    const write = sealedFor(earlierSession, launchA, [runtimeWrite], 1_000);
    jar[write.name] = write.value;
    // This session's newer launches: one with unfinished (confirmed) work,
    // two empty; one more than the budget leaves room for.
    const confirmed = sealedFor(
      laterSession,
      launch(1),
      [{ ...runtimeWrite, operationId: "runtime-op-0002", phase: "confirmed" }],
      2_000,
    );
    jar[confirmed.name] = confirmed.value;
    const empties = [launch(2), launch(3)].map((id, index) => {
      const cookie = sealedFor(laterSession, id, [], 3_000 + index);
      jar[cookie.name] = cookie.value;
      return cookie.name;
    });
    expect(
      launchWouldDropUnresolved(requestWith(jar), freshScope(), 9_999),
    ).toBe(false);
    // The oldest empty launch goes; the earlier session's runtime write is
    // kept (never named), though it is the oldest of all.
    expect(writeFresh(jar)).toEqual([empties[0]]);
    // A runtime write that is only confirmed (no assertion left the wallet)
    // is not history: an earlier session's such launch is dropped.
    const onlyConfirmed = sealedFor(
      earlierSession,
      launchB,
      [{ ...runtimeWrite, phase: "confirmed" }],
      1_000,
    );
    expect(writeFresh({ [onlyConfirmed.name]: onlyConfirmed.value })).toEqual([
      onlyConfirmed.name,
    ]);
  });

  it(`refuses, and never drops, when ${MAX_FACE_LAUNCHES} kept launches all hold unresolved evidence`, () => {
    const jar: Record<string, string> = {};
    const kinds: FaceJournalEntry[][] = [
      [runtimeWrite],
      [sentStep],
      [entry],
      [{ ...runtimeWrite, operationId: "runtime-op-0009" }],
    ];
    const names = kinds.map((entries, index) => {
      // Two from an earlier session of the same wallet, two from this one.
      const cookie = sealedFor(
        index % 2 ? laterSession : earlierSession,
        launch(index),
        entries,
        1_000 + index,
      );
      jar[cookie.name] = cookie.value;
      return cookie.name;
    });
    // Another wallet's and an unreadable cookie are not this wallet's
    // evidence: they are still dropped.
    const foreign = sealedFor(
      { sidHash: "sid-1", walletId: "wallet-2" },
      launch(7),
      [runtimeWrite],
      1_500,
    );
    jar[foreign.name] = foreign.value;
    const garbage = faceJournalCookieName(launch(8));
    jar[garbage] = "not-sealed";

    expect(
      launchWouldDropUnresolved(requestWith(jar), freshScope(), 9_999),
    ).toBe(true);
    // Defence in depth: the journal write of a fifth launch drops none of
    // them (it would not be reached: the routes refuse first).
    const cleared = writeFresh(jar);
    expect(cleared).toEqual([foreign.name, garbage].sort());
    for (const name of names) expect(cleared).not.toContain(name);
    // Another wallet's launch is not refused on this wallet's evidence.
    expect(
      launchWouldDropUnresolved(
        requestWith(jar),
        freshScope({ sidHash: "sid-3", walletId: "wallet-2" }),
        9_999,
      ),
    ).toBe(false);
    // One of the four launches itself is not refused: its own cookie is not
    // among the others, so nothing would be dropped.
    expect(
      launchWouldDropUnresolved(
        requestWith(jar),
        { ...scope(launch(1)), owner: laterSession },
        9_999,
      ),
    ).toBe(false);
  });

  it("is not refused with spare budget or a droppable launch; the oldest finished one goes as before", () => {
    const jar: Record<string, string> = {};
    const evidence = [runtimeWrite, sentStep, entry].map((item, index) => {
      const cookie = sealedFor(laterSession, launch(index), [item], 1_000);
      jar[cookie.name] = cookie.value;
      return cookie.name;
    });
    // Three evidence launches: exactly the room the budget leaves.
    expect(
      launchWouldDropUnresolved(requestWith(jar), freshScope(), 9_999),
    ).toBe(false);
    expect(writeFresh(jar)).toEqual([]);
    // Two finished (settled, cancelled) and one empty launch, all newer:
    // still not refused, and those go, never the evidence.
    const settled = sealedFor(
      laterSession,
      launch(4),
      [{ ...runtimeWrite, phase: "settled" }],
      2_000,
    );
    const cancelled = sealedFor(
      laterSession,
      launch(5),
      [{ ...runtimeWrite, phase: "cancelled" }],
      2_001,
    );
    const empty = sealedFor(laterSession, launch(6), [], 2_002);
    for (const cookie of [settled, cancelled, empty])
      jar[cookie.name] = cookie.value;
    expect(
      launchWouldDropUnresolved(requestWith(jar), freshScope(), 9_999),
    ).toBe(false);
    const cleared = writeFresh(jar);
    expect(cleared).toEqual([settled.name, cancelled.name, empty.name].sort());
    for (const name of evidence) expect(cleared).not.toContain(name);
    // With one evidence launch fewer there is one slot: the newest finished
    // launch stays, the oldest finished ones go.
    delete jar[evidence[2]];
    expect(writeFresh(jar)).toEqual([settled.name, cancelled.name].sort());
  });
});

describe("a new launch refused launch_capacity (route level)", () => {
  const SLUG = "morrow-home";
  const keys = generateKeyPairSync("ed25519");
  const jwt = (claims: Record<string, unknown>) =>
    `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
  const earlierSession = { sidHash: "sid-earlier", walletId: "wallet-1" };
  const fresh = "launch-newnewnewnewnewnewnewnewnewnew";
  const kept = `launch-${"0".repeat(28)}`;
  const runtimeWrite = (operationId: string): FaceJournalEntry => ({
    operationId,
    kind: "runtime",
    operation: "case.open",
    slug: SLUG,
    programmeId: "morrow-home-arc",
    objectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    phase: "assertion_issued",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    issuedAt: Date.now(),
  });

  beforeEach(() => {
    process.env.PRODUCT_FACE_APPLICATIONS = JSON.stringify([bindingInput()]);
    process.env.FACE_ASSERTION_KEY_ID = "wallet-face-test";
    process.env.FACE_ASSERTION_SIGNING_KEY = keys.privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();
    getWallet.mockReset().mockResolvedValue({
      id: "wallet-1",
      language: "en",
      fqdn: "localhost",
      activated: true,
      emailVerified: true,
      disabled: false,
      account: {
        address: HOLDER,
        type: "SMART_WALLET",
        controller: {
          address: "0xcontroller",
          type: "SECP256K1",
          custody: "custodial",
        },
        smartAccount: {},
      },
      whenCreated: new Date(),
      whenModified: new Date(),
    });
    getObjectById.mockReset();
    getObjectByIdPublic.mockReset();
    jest.mocked(verifyFaceArtifact).mockReset().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    delete process.env.PRODUCT_FACE_APPLICATIONS;
    delete process.env.FACE_ASSERTION_KEY_ID;
    delete process.env.FACE_ASSERTION_SIGNING_KEY;
  });

  /** A signed-in browser holding four launches of issued runtime writes. */
  function browserJar() {
    const cookies: Record<string, string> = {};
    const session = NextResponse.json({});
    establishSession(
      session,
      {
        accessToken: jwt({
          org_id: DEFAULT_ORGANIZATION_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
        refreshToken: jwt({ exp: Math.floor(Date.now() / 1000) + 7200 }),
      } as unknown as LoginOut,
      {
        organizationId: DEFAULT_ORGANIZATION_ID,
        subdomain: "*",
        host: "localhost",
      },
      "email",
    );
    for (const cookie of session.cookies.getAll())
      cookies[cookie.name] = cookie.value;
    for (let index = 0; index < MAX_FACE_LAUNCHES; index += 1) {
      const launchId = `launch-${String(index).repeat(28)}`;
      const response = NextResponse.json({});
      writeFaceJournal(
        response,
        emptyRequest(),
        { ...scope(launchId), owner: earlierSession },
        {
          entries: [runtimeWrite(`runtime-op-000${index}`)],
          selections: [],
          mints: [],
        },
      );
      const cookie = response.cookies.get(faceJournalCookieName(launchId))!;
      cookies[cookie.name] = cookie.value;
    }
    return cookies;
  }

  const faceRequest = (
    cookies: Record<string, string>,
    launchId: string,
    path: string,
    body?: unknown,
  ) =>
    new NextRequest(`http://localhost/api/faces/${SLUG}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        host: "localhost",
        origin: "http://localhost",
        cookie: Object.entries(cookies)
          .map(([name, value]) => `${name}=${value}`)
          .join("; "),
        "x-dual-face-launch": launchId,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const params = () => ({ params: Promise.resolve({ slug: SLUG }) });
  const launchCookiesSet = (response: Response) =>
    (response as NextResponse).cookies
      .getAll()
      .filter((cookie) => cookie.name.startsWith(FACE_JOURNAL_COOKIE_PREFIX))
      .map((cookie) => cookie.name);

  it("refuses the context, operation and assertion requests 409 before any work: nothing read, minted, journaled or dropped", async () => {
    const cookies = browserJar();
    for (const response of [
      await contextGET(
        faceRequest(cookies, fresh, "/context?task=%2F"),
        params(),
      ),
      await operationsPOST(
        faceRequest(cookies, fresh, "/operations", {
          transition: "begin",
          kind: "runtime",
          operation: "case.open",
          operation_id: "runtime-op-0100",
          object_id: "aaaaaaaaaaaaaaaaaaaaaaaa",
        }),
        params(),
      ),
      await assertionsPOST(
        faceRequest(cookies, fresh, "/assertions", {
          operation: "case.open",
          operation_id: "runtime-op-0000",
          target: { object_id: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        }),
        params(),
      ),
    ]) {
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body).toMatchObject({ code: "launch_capacity" });
      expect(body).not.toHaveProperty("assertion");
      // No launch cookie is written, re-sealed or cleared.
      expect(launchCookiesSet(response)).toEqual([]);
    }
    expect(verifyFaceArtifact).not.toHaveBeenCalled();
    expect(getObjectById).not.toHaveBeenCalled();
    expect(getObjectByIdPublic).not.toHaveBeenCalled();
  });

  it("still serves one of the kept launches itself, dropping none of the others", async () => {
    const response = await contextGET(
      faceRequest(browserJar(), kept, "/context?task=%2F"),
      params(),
    );
    expect(response.status).toBe(200);
    expect(launchCookiesSet(response)).toEqual([faceJournalCookieName(kept)]);
  });
});
