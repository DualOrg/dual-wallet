/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from "next/server";
import {
  FACE_JOURNAL_COOKIE,
  readFaceJournal,
  writeFaceJournal,
} from "@/api/face-journal";
import { sealForPurpose } from "@/api/server-session";

const owner = { sidHash: "sid-1", walletId: "wallet-1" };
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

function sealed() {
  const response = NextResponse.json({});
  writeFaceJournal(response, owner, {
    entries: [entry],
    selections: [],
    mints: [Date.now() + 30_000],
  });
  return response.cookies.get(FACE_JOURNAL_COOKIE)!;
}

const requestWith = (value: string) =>
  new NextRequest("http://localhost/api/faces/x/operations", {
    headers: { cookie: `${FACE_JOURNAL_COOKIE}=${value}` },
  });

describe("face operation journal cookie", () => {
  it("is host-only, HttpOnly and SameSite=Strict, and holds no secrets", () => {
    const cookie = sealed();
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      path: "/",
    });
    expect(cookie).not.toHaveProperty("domain");
    expect(cookie.value).not.toContain("register-op-0001");
    expect(readFaceJournal(requestWith(cookie.value), owner).entries).toEqual([
      entry,
    ]);
  });

  it("reads as empty for another session or wallet", () => {
    const value = sealed().value;
    expect(
      readFaceJournal(requestWith(value), { ...owner, sidHash: "sid-2" })
        .entries,
    ).toEqual([]);
    expect(
      readFaceJournal(requestWith(value), { ...owner, walletId: "wallet-2" })
        .entries,
    ).toEqual([]);
  });

  it("rejects tampering and values sealed for another purpose", () => {
    const value = sealed().value;
    const tampered = `${value.slice(0, -2)}${value.endsWith("A") ? "B" : "A"}`;
    expect(readFaceJournal(requestWith(tampered), owner).entries).toEqual([]);
    const otherPurpose = sealForPurpose("dual-other", {
      v: 1,
      sid: owner.sidHash,
      wallet: owner.walletId,
      entries: [entry],
    });
    expect(readFaceJournal(requestWith(otherPurpose), owner).entries).toEqual(
      [],
    );
  });

  it("drops expired assertion mints from the outstanding count", () => {
    const response = NextResponse.json({});
    writeFaceJournal(response, owner, {
      entries: [],
      selections: [],
      mints: [Date.now() - 1, Date.now() + 30_000],
    });
    const journal = readFaceJournal(
      requestWith(response.cookies.get(FACE_JOURNAL_COOKIE)!.value),
      owner,
    );
    expect(journal.mints).toHaveLength(1);
  });
});
