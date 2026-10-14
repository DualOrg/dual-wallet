/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from "next/server";
import {
  bindFaceHandoverToSession,
  clearFaceHandover,
  FACE_HANDOVER_COOKIE,
  FACE_HANDOVER_TTL_SECONDS,
  inspectFaceHandover,
  readFaceHandover,
  writeFaceHandover,
  type FaceHandoverOwner,
} from "@/api/face-handover";
import { sealForPurpose } from "@/api/server-session";

const TICKET = "tkt_".padEnd(43, "Q");
const A: FaceHandoverOwner = { walletId: "wallet-a", sidHash: "sid-a" };
const B: FaceHandoverOwner = { walletId: "wallet-b", sidHash: "sid-b" };

function written(
  slug = "morrow-home",
  owner: FaceHandoverOwner | null = null,
  now = Date.now(),
) {
  const response = NextResponse.json({});
  writeFaceHandover(response, slug, TICKET, owner, now);
  return response.cookies.get(FACE_HANDOVER_COOKIE)!;
}

const requestWith = (value: string) =>
  new NextRequest("http://localhost/api/faces/morrow-home/context", {
    headers: { cookie: `${FACE_HANDOVER_COOKIE}=${value}` },
  });

const ownerOf = (response: NextResponse) => {
  const cookie = response.cookies.get(FACE_HANDOVER_COOKIE);
  if (!cookie?.value) return cookie ? "cleared" : "untouched";
  const found = inspectFaceHandover(requestWith(cookie.value));
  return found.state === "valid" ? found.entry.owner : "invalid";
};

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
    expect(written("morrow-home", A).value).not.toContain("wallet-a");
  });

  it("is handed over only to its own session, or anonymous; another account's is refused and cleared", () => {
    const bound = written("morrow-home", A).value;
    expect(
      readFaceHandover(requestWith(bound), "morrow-home", A, { consume: true }),
    ).toEqual({ ticket: TICKET, clear: true });
    for (const other of [B, { walletId: "wallet-a", sidHash: "sid-other" }]) {
      expect(
        readFaceHandover(requestWith(bound), "morrow-home", other, {
          consume: true,
        }),
      ).toEqual({ clear: true, refused: true });
      // Refused on any task and for any programme: it is never this session's.
      expect(
        readFaceHandover(requestWith(bound), "tidewell", other, {
          consume: false,
        }),
      ).toEqual({ clear: true, refused: true });
    }
    // Another programme of the same session leaves it alone.
    expect(
      readFaceHandover(requestWith(bound), "tidewell", A, { consume: true }),
    ).toEqual({ clear: false });
    // Another task of the same session keeps it for the register task.
    expect(
      readFaceHandover(requestWith(bound), "morrow-home", A, {
        consume: false,
      }),
    ).toEqual({ clear: false });
  });

  it("an anonymous ticket is taken on the register task, or bound to the first authenticated reader", () => {
    const anonymous = written().value;
    expect(
      readFaceHandover(requestWith(anonymous), "morrow-home", A, {
        consume: true,
      }),
    ).toEqual({ ticket: TICKET, clear: true });
    const read = readFaceHandover(requestWith(anonymous), "morrow-home", A, {
      consume: false,
    });
    expect(read.clear).toBe(false);
    expect(read.bind?.owner).toEqual(A);
    expect(read.bind?.ticket).toBe(TICKET);
  });

  it("an expired, tampered or foreign value is cleared and never handed over", () => {
    const now = Date.now();
    const old = written("morrow-home", null, now - 11 * 60_000);
    expect(
      readFaceHandover(requestWith(old.value), "morrow-home", A, {
        consume: true,
      }),
    ).toEqual({ clear: true });
    const cookie = written();
    const tampered = `${cookie.value.slice(0, -2)}${cookie.value.endsWith("A") ? "B" : "A"}`;
    expect(
      readFaceHandover(requestWith(tampered), "morrow-home", A, {
        consume: true,
      }),
    ).toEqual({ clear: true });
    const foreign = sealForPurpose("dual-face-journal-v2:x", {
      v: 2,
      slug: "morrow-home",
      ticket: TICKET,
      exp: now + 60_000,
      owner: null,
    });
    expect(
      readFaceHandover(requestWith(foreign), "morrow-home", A, {
        consume: true,
      }),
    ).toEqual({ clear: true });
  });

  it("a new session binds an anonymous ticket, follows the same wallet and clears another account's", () => {
    const signIn = (value: string, owner: FaceHandoverOwner) => {
      const response = NextResponse.json({});
      bindFaceHandoverToSession(requestWith(value), response, owner);
      return response;
    };
    expect(ownerOf(signIn(written().value, A))).toEqual(A);
    // The same wallet signing in again: the ticket follows the new session.
    const again = { walletId: "wallet-a", sidHash: "sid-a2" };
    expect(ownerOf(signIn(written("morrow-home", A).value, again))).toEqual(
      again,
    );
    // Another account: cleared in the sign-in response itself.
    expect(ownerOf(signIn(written("morrow-home", A).value, B))).toBe("cleared");
    expect(ownerOf(signIn("garbage", A))).toBe("cleared");
    const none = NextResponse.json({});
    bindFaceHandoverToSession(
      new NextRequest("http://localhost/api/session/login"),
      none,
      A,
    );
    expect(ownerOf(none)).toBe("untouched");
  });

  it("in production is a __Host- cookie: Secure, path /, no Domain", async () => {
    const previous = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    try {
      jest.resetModules();
      const prod = await import("@/api/face-handover");
      expect(prod.FACE_HANDOVER_COOKIE).toBe("__Host-dual_face_handover");
      const response = NextResponse.json({});
      prod.writeFaceHandover(response, "morrow-home", TICKET, A);
      const cookie = response.cookies.get(prod.FACE_HANDOVER_COOKIE)!;
      expect(cookie).toMatchObject({
        secure: true,
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: FACE_HANDOVER_TTL_SECONDS,
      });
      expect(cookie).not.toHaveProperty("domain");
      const request = new NextRequest(
        "https://demo.wallet.example/api/faces/morrow-home/context",
        { headers: { cookie: `${prod.FACE_HANDOVER_COOKIE}=${cookie.value}` } },
      );
      expect(
        prod.readFaceHandover(request, "morrow-home", A, { consume: true }),
      ).toEqual({ ticket: TICKET, clear: true });
      const cleared = NextResponse.json({});
      prod.clearFaceHandover(cleared);
      expect(cleared.cookies.get(prod.FACE_HANDOVER_COOKIE)).toMatchObject({
        value: "",
        secure: true,
        path: "/",
      });
    } finally {
      (process.env as Record<string, string>).NODE_ENV = previous!;
      jest.resetModules();
    }
  });

  it("clears with an expired, empty cookie", () => {
    const response = NextResponse.json({});
    clearFaceHandover(response);
    const cleared = response.cookies.get(FACE_HANDOVER_COOKIE)!;
    expect(cleared.value).toBe("");
    expect(cleared.expires).toEqual(new Date(0));
  });
});
