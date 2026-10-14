/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from "next/server";
import {
  clearFaceHandover,
  FACE_HANDOVER_COOKIE,
  FACE_HANDOVER_TTL_SECONDS,
  readFaceHandover,
  writeFaceHandover,
} from "@/api/face-handover";
import { sealForPurpose } from "@/api/server-session";

const TICKET = "tkt_".padEnd(43, "Q");

function written(slug = "morrow-home", now = Date.now()) {
  const response = NextResponse.json({});
  writeFaceHandover(response, slug, TICKET, now);
  return response.cookies.get(FACE_HANDOVER_COOKIE)!;
}

const requestWith = (value: string) =>
  new NextRequest("http://localhost/api/faces/morrow-home/context", {
    headers: { cookie: `${FACE_HANDOVER_COOKIE}=${value}` },
  });

describe("face handover cookie (contract r14)", () => {
  it("is sealed, HttpOnly, SameSite=Strict, host-only and lives ten minutes at most", () => {
    const cookie = written();
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: FACE_HANDOVER_TTL_SECONDS,
    });
    expect(FACE_HANDOVER_TTL_SECONDS).toBeLessThanOrEqual(600);
    expect(cookie).not.toHaveProperty("domain");
    expect(cookie.value).not.toContain(TICKET);
    expect(cookie.value).not.toContain("morrow-home");
  });

  it("opens only for its slug, once it is read it is cleared", () => {
    const cookie = written();
    expect(readFaceHandover(requestWith(cookie.value), "morrow-home")).toEqual({
      ticket: TICKET,
      clear: true,
    });
    // Another programme cannot open it and leaves it alone.
    expect(readFaceHandover(requestWith(cookie.value), "tidewell")).toEqual({
      clear: false,
    });
  });

  it("refuses an expired, tampered or foreign value", () => {
    const now = Date.now();
    const old = written("morrow-home", now - 11 * 60_000);
    expect(
      readFaceHandover(requestWith(old.value), "morrow-home", now),
    ).toEqual({ clear: true });
    const cookie = written();
    const tampered = `${cookie.value.slice(0, -2)}${cookie.value.endsWith("A") ? "B" : "A"}`;
    expect(readFaceHandover(requestWith(tampered), "morrow-home")).toEqual({
      clear: false,
    });
    const foreign = sealForPurpose("dual-face-journal-v2:x", {
      v: 1,
      slug: "morrow-home",
      ticket: TICKET,
      exp: now + 60_000,
    });
    expect(readFaceHandover(requestWith(foreign), "morrow-home")).toEqual({
      clear: false,
    });
  });

  it("clears with an expired, empty cookie", () => {
    const response = NextResponse.json({});
    clearFaceHandover(response);
    const cleared = response.cookies.get(FACE_HANDOVER_COOKIE)!;
    expect(cleared.value).toBe("");
    expect(cleared.expires).toEqual(new Date(0));
  });
});
