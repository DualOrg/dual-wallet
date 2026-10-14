/**
 * @jest-environment node
 */
// G8, contract r19 (accept names the product), the recipient's host
// through the real BFF routes:
// - the accept task's context read hands the acceptance ticket to the face
//   once (r16) and the BFF keeps it, sealed, HttpOnly, SameSite=Strict, bound
//   to the slug, launch and session;
// - /accept-offer reads which unit it is for itself (the runtime's
//   transfer.acceptance.read, server to server, the session's own assertion),
//   then names the unit from Dual's PUBLIC projection in this programme, and
//   binds it to the kept acceptance;
// - a transfer.accept assertion is minted only for exactly that unit;
// - the ticket is never in a later response; the answer never carries the
//   previous owner's address, a case or a document.
import { createHash, generateKeyPairSync } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_ORGANIZATION_ID } from "@/api/tenant";
import type { LoginOut } from "@/api/web-sdk/models/LoginOut";
import {
  bindingInput,
  HOLDER,
  TEMPLATE_A,
  TEMPLATE_B,
} from "@/test/product-face-fixtures";

const getWallet = jest.fn();
const refreshToken = jest.fn();
const getObjectById = jest.fn();
const getObjectByIdPublic = jest.fn();
jest.mock("@/api/web-sdk-client", () => ({
  getWalletsApi: () => ({ getWallet, refreshToken, logout: jest.fn() }),
  getObjectsApi: () => ({ getObjectById, getObjectByIdPublic }),
}));
// The pinned artifact is verified elsewhere (api/face-artifact.test.ts); the
// bounded fetch the runtime calls use is the real one.
jest.mock("@/api/face-artifact", () => ({
  ...jest.requireActual("@/api/face-artifact"),
  verifyFaceArtifact: async () => ({ ok: true }),
}));

import { FACE_ACCEPTANCE_COOKIE } from "@/api/face-acceptance";
import { establishSession } from "@/api/server-session";
import { POST as acceptOfferPOST } from "@/app/api/faces/[slug]/accept-offer/route";
import { POST as assertionsPOST } from "@/app/api/faces/[slug]/assertions/route";
import { GET as contextGET } from "@/app/api/faces/[slug]/context/route";
import { POST as handoverPOST } from "@/app/api/faces/[slug]/handover/route";
import { POST as logoutPOST } from "@/app/api/session/logout/route";

const UNIT = "aaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_UNIT = "bbbbbbbbbbbbbbbbbbbbbbbb";
const SLUG = "morrow-home";
const TICKET = "t".repeat(43);
// The previous owner (the sender): never in anything the recipient sees.
const SENDER = "0x00000000000000000000000000000000000000a1";
const keys = generateKeyPairSync("ed25519");

type Handler = (
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) => Promise<Response>;

function jwt(claims: Record<string, unknown>) {
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
const sha256 = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
const claimsOf = (assertion: string) =>
  JSON.parse(
    Buffer.from(assertion.split(".")[1], "base64url").toString("utf8"),
  ) as Record<string, unknown>;

/** The recipient's browser: its own session and one face launch. */
class Browser {
  cookies = new Map<string, string>();
  /** Every response body this browser received, in order. */
  bodies: Array<{ path: string; text: string }> = [];
  constructor(readonly launchId = `launch-${"r".repeat(28)}`) {
    const response = NextResponse.json({});
    establishSession(
      response,
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
    this.take(response);
  }

  take(response: Response) {
    for (const cookie of (response as NextResponse).cookies.getAll()) {
      if (cookie.value) this.cookies.set(cookie.name, cookie.value);
      else this.cookies.delete(cookie.name);
    }
    return response;
  }

  async call(
    handler: Handler,
    path: string,
    {
      method = "POST",
      body,
      slug = SLUG,
      launchId = this.launchId,
    }: {
      method?: string;
      body?: unknown;
      slug?: string;
      launchId?: string;
    } = {},
  ) {
    const response = this.take(
      await handler(
        new NextRequest(`http://localhost${path}`, {
          method,
          headers: {
            host: "localhost",
            origin: "http://localhost",
            "x-dual-face-launch": launchId,
            cookie: Array.from(this.cookies, ([k, v]) => `${k}=${v}`).join(
              "; ",
            ),
            ...(body === undefined
              ? {}
              : { "content-type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        { params: Promise.resolve({ slug }) },
      ),
    );
    const text = await response.text();
    this.bodies.push({ path, text });
    return {
      status: response.status,
      body: JSON.parse(text) as Record<string, unknown>,
      text,
      cookie: (response as NextResponse).cookies.get(FACE_ACCEPTANCE_COOKIE),
    };
  }

  /** The sender's link reached this wallet's entry, then the accept task. */
  async openAcceptance(slug = SLUG) {
    const stored = await this.call(
      handoverPOST,
      `/api/faces/${slug}/handover`,
      {
        body: { ticket: TICKET, kind: "accept" },
        slug,
      },
    );
    expect(stored.status).toBe(200);
    return this.call(
      contextGET,
      `/api/faces/${slug}/context?task=${encodeURIComponent("/accept")}`,
      { method: "GET", slug },
    );
  }

  acceptOffer(body: unknown = {}, options: { launchId?: string } = {}) {
    return this.call(acceptOfferPOST, `/api/faces/${SLUG}/accept-offer`, {
      body,
      ...options,
    });
  }

  authorizeAccept(
    target: unknown,
    options: { launchId?: string; operationId?: string } = {},
  ) {
    return this.call(assertionsPOST, `/api/faces/${SLUG}/assertions`, {
      body: {
        operation: "transfer.accept",
        operation_id: options.operationId ?? "accept-op-0001",
        target,
        request_hash: `sha256:${"1".repeat(64)}`,
      },
      launchId: options.launchId,
    });
  }

  /** The wallet's own sign-out (no slug, no launch). */
  async logout() {
    return this.take(
      await logoutPOST(
        new NextRequest("http://localhost/api/session/logout", {
          method: "POST",
          headers: {
            host: "localhost",
            origin: "http://localhost",
            cookie: Array.from(this.cookies, ([k, v]) => `${k}=${v}`).join(
              "; ",
            ),
          },
        }),
      ),
    );
  }
}

/**
 * LOCAL FAKE of the runtime's transfer.acceptance.read (r19): it
 * answers ONLY {object_id} for the one acceptance ticket, to the recipient's
 * own assertion bound to exactly that request.
 */
function fakeAcceptanceRuntime(
  answer: (body: Record<string, unknown>) => [number, unknown] = () => [
    200,
    {
      ok: true,
      status: "transfer_acceptance",
      object_id: UNIT,
      secretReturned: false,
    },
  ],
) {
  const calls: Array<{
    origin: string | null;
    claims: Record<string, unknown>;
    body: Record<string, unknown>;
  }> = [];
  const fetchImpl = jest.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const claims = claimsOf(String(body.assertion));
    calls.push({
      origin: new Headers(init.headers).get("origin"),
      claims,
      body,
    });
    const { assertion: _assertion, ...rest } = body;
    void _assertion;
    if (
      claims.operation !== body.operation ||
      claims.op_id !== body.operationId ||
      claims.request_hash !== sha256(canonical(rest)) ||
      claims.holder !== HOLDER.toLowerCase()
    ) {
      return new Response(
        JSON.stringify({ ok: false, status: "face_assertion_mismatch" }),
        { status: 403 },
      );
    }
    const [status, value] = answer(body);
    return new Response(JSON.stringify(value), { status });
  });
  return { fetchImpl, calls };
}

// Dual's public projection of the offered unit, still held by the sender. Its
// custom map carries more than the programme projects (a case, a document, a
// contact): none of it may reach the recipient.
const offeredUnit = (overrides: Record<string, unknown> = {}) => ({
  id: UNIT,
  templateId: TEMPLATE_A,
  owner: SENDER,
  custom: {
    recordId: "rec-0001",
    serialNumber: "MH-ARC-0102",
    model: "Arc 2",
    state: "Transfer pending",
    caseId: "case-0001",
    documents: [{ name: "receipt-0001.pdf" }],
    contact: "sender@example.test",
  },
  metadata: { name: "Arc grinder" },
  whenModified: new Date("2026-10-01T00:00:00Z"),
  ...overrides,
});

function expectNothingPrivate(text: string) {
  expect(text).not.toContain(TICKET);
  expect(text.toLowerCase()).not.toContain(SENDER.toLowerCase());
  expect(text).not.toMatch(
    /case-0001|caseId|receipt-0001|documents|sender@example|"owner"/,
  );
}

const original = global.fetch;
beforeEach(() => {
  process.env.PRODUCT_FACE_APPLICATIONS = JSON.stringify([
    bindingInput({ handover: { enabled: true } }),
    bindingInput({
      slug: "tidewell",
      programmeName: "Tidewell",
      handover: { enabled: true },
    }),
  ]);
  process.env.FACE_ASSERTION_KEY_ID = "wallet-face-test";
  process.env.FACE_ASSERTION_SIGNING_KEY = keys.privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString();
  getWallet.mockReset().mockResolvedValue({
    id: "wallet-1",
    account: {
      address: HOLDER,
      type: "SMART_WALLET",
      controller: { address: "0xcontroller" },
      smartAccount: {},
    },
    whenCreated: new Date(),
    whenModified: new Date(),
    emailVerified: true,
  });
  getObjectById.mockReset();
  getObjectByIdPublic.mockReset().mockResolvedValue(offeredUnit());
});
afterEach(() => {
  global.fetch = original;
  delete process.env.PRODUCT_FACE_APPLICATIONS;
  delete process.env.FACE_ASSERTION_KEY_ID;
  delete process.env.FACE_ASSERTION_SIGNING_KEY;
});

describe("G8 acceptance names the product (r19), the recipient's host", () => {
  it("keeps the handed ticket sealed and server-only, reads the unit itself, names it from the public projection and mints the acceptance only for it", async () => {
    const runtime = fakeAcceptanceRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const browser = new Browser();
    const context = await browser.openAcceptance();
    // r16: the face is handed the ticket once, in its initialize context.
    expect(context.status).toBe(200);
    expect(context.body.acceptance).toEqual({ ticket: TICKET });
    // The BFF keeps it: sealed, HttpOnly, SameSite=Strict, ten minutes at most.
    expect(context.cookie).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      path: "/",
    });
    expect(context.cookie!.maxAge).toBeGreaterThan(0);
    expect(context.cookie!.maxAge).toBeLessThanOrEqual(600);
    expect(context.cookie!.value).not.toContain(TICKET);

    const read = await browser.acceptOffer();
    expect(read.status).toBe(200);
    // Server to server, no Origin: exactly the acceptance read for the kept
    // ticket, with the recipient's own assertion.
    expect(runtime.calls).toHaveLength(1);
    const [call] = runtime.calls;
    expect(call.origin).toBeNull();
    expect(call.body).toMatchObject({
      operation: "transfer.acceptance.read",
      target: {},
      input: { acceptance_ticket: TICKET },
    });
    expect(Object.keys(call.body.input as object)).toEqual([
      "acceptance_ticket",
    ]);
    expect(call.claims).toMatchObject({
      operation: "transfer.acceptance.read",
      holder: HOLDER.toLowerCase(),
    });
    expect(getObjectByIdPublic).toHaveBeenCalledWith(
      { objectId: UNIT },
      { cache: "no-store" },
    );
    // The unit's own facts: its name and the programme's projection fields.
    expect(read.body).toEqual({
      unit: {
        objectId: UNIT,
        templateId: TEMPLATE_A,
        name: "Arc grinder",
        recordId: "rec-0001",
        fields: {
          serialNumber: "MH-ARC-0102",
          model: "Arc 2",
          state: "Transfer pending",
        },
        readback: {
          ownerIsYou: false,
          state: "Transfer pending",
          lifecycleTarget: null,
        },
        registration: expect.any(String),
      },
    });
    // Never the ticket, the previous owner's address, a case or a document.
    expectNothingPrivate(read.text);
    expect(read.cookie?.value).toBeTruthy();
    expect(read.cookie!.value).not.toContain(TICKET);
    expect(read.cookie).toMatchObject({ httpOnly: true, sameSite: "strict" });

    // The acceptance is minted for exactly that unit.
    const minted = await browser.authorizeAccept({ object_id: UNIT });
    expect(minted.status).toBe(200);
    expect(claimsOf(String(minted.body.assertion))).toMatchObject({
      operation: "transfer.accept",
      holder: HOLDER.toLowerCase(),
    });
    expect(JSON.stringify(claimsOf(String(minted.body.assertion)))).toContain(
      UNIT,
    );
    // The ticket is in no response after the face's one hand-over.
    for (const { path, text } of browser.bodies) {
      if (path.includes("/context")) continue;
      expect(text).not.toContain(TICKET);
    }
  });

  it("a face naming another unit, or no unit, is refused and nothing is minted", async () => {
    const runtime = fakeAcceptanceRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const browser = new Browser();
    await browser.openAcceptance();
    expect((await browser.acceptOffer()).status).toBe(200);
    const other = await browser.authorizeAccept({ object_id: OTHER_UNIT });
    expect(other).toMatchObject({
      status: 409,
      body: { code: "stale_context" },
    });
    expect(other.body).not.toHaveProperty("assertion");
    // The r16 empty target is no longer an acceptance.
    const empty = await browser.authorizeAccept({});
    expect(empty).toMatchObject({
      status: 400,
      body: { code: "invalid_request" },
    });
    expect(empty.body).not.toHaveProperty("assertion");
    // The unit itself still mints.
    expect((await browser.authorizeAccept({ object_id: UNIT })).status).toBe(
      200,
    );
  });

  it("without a unit read for this launch's acceptance nothing is minted; without a kept acceptance (a pasted link) nothing is read", async () => {
    const runtime = fakeAcceptanceRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    // Kept but not read yet: no unit is bound, so no acceptance is minted.
    const browser = new Browser();
    await browser.openAcceptance();
    const unread = await browser.authorizeAccept({ object_id: UNIT });
    expect(unread).toMatchObject({
      status: 400,
      body: { code: "invalid_request" },
    });
    expect(unread.body).not.toHaveProperty("assertion");
    // No acceptance at all (the face only previewed a pasted link).
    const pasted = new Browser();
    const none = await pasted.acceptOffer();
    expect(none).toMatchObject({
      status: 400,
      body: { code: "invalid_request" },
    });
    expect(
      (await pasted.authorizeAccept({ object_id: UNIT })).body,
    ).toMatchObject({ code: "invalid_request" });
    expect(runtime.calls).toHaveLength(0);
    expect(getObjectByIdPublic).not.toHaveBeenCalled();
    // The face supplies nothing for the read.
    for (const body of [{ ticket: TICKET }, { object_id: UNIT }]) {
      expect(await browser.acceptOffer(body)).toMatchObject({
        status: 400,
        body: { code: "invalid_request" },
      });
    }
    expect(runtime.calls).toHaveLength(0);
  });

  it("is bound to its launch, slug and session: another launch, programme or session reads nothing and mints nothing; logout clears it", async () => {
    const runtime = fakeAcceptanceRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const browser = new Browser();
    await browser.openAcceptance();
    expect((await browser.acceptOffer()).status).toBe(200);
    expect(runtime.calls).toHaveLength(1);
    const kept = browser.cookies.get(FACE_ACCEPTANCE_COOKIE)!;
    expect(kept).toBeTruthy();

    // Another launch (another frame or tab) of the same session.
    const otherLaunch = `launch-${"s".repeat(28)}`;
    expect(
      await browser.acceptOffer({}, { launchId: otherLaunch }),
    ).toMatchObject({ status: 400, body: { code: "invalid_request" } });
    expect(
      await browser.authorizeAccept(
        { object_id: UNIT },
        { launchId: otherLaunch },
      ),
    ).toMatchObject({ status: 400, body: { code: "invalid_request" } });

    // Another programme's face, same launch id.
    const tidewell = await browser.call(
      acceptOfferPOST,
      "/api/faces/tidewell/accept-offer",
      { body: {}, slug: "tidewell" },
    );
    expect(tidewell).toMatchObject({
      status: 400,
      body: { code: "invalid_request" },
    });

    // Another session (same wallet, another sign-in) carrying the cookie.
    const otherSession = new Browser(browser.launchId);
    otherSession.cookies.set(FACE_ACCEPTANCE_COOKIE, kept);
    expect(await otherSession.acceptOffer()).toMatchObject({
      status: 400,
      body: { code: "invalid_request" },
    });
    expect(
      await otherSession.authorizeAccept({ object_id: UNIT }),
    ).toMatchObject({ status: 400, body: { code: "invalid_request" } });
    expect(runtime.calls).toHaveLength(1);

    // A tampered cookie is no acceptance.
    const tampered = new Browser(browser.launchId);
    tampered.cookies = new Map(browser.cookies);
    tampered.cookies.set(
      FACE_ACCEPTANCE_COOKIE,
      `${kept.slice(0, -4)}${kept.slice(-4) === "AAAA" ? "BBBB" : "AAAA"}`,
    );
    expect(
      (await tampered.authorizeAccept({ object_id: UNIT })).body,
    ).toMatchObject({ code: "invalid_request" });

    // Logout clears it in the logout response itself.
    const loggedOut = (await browser.logout()) as NextResponse;
    expect(loggedOut.cookies.get(FACE_ACCEPTANCE_COOKIE)).toMatchObject({
      value: "",
    });
    expect(browser.cookies.has(FACE_ACCEPTANCE_COOKIE)).toBe(false);
  });

  it("expires with the ticket (ten minutes at most)", async () => {
    const runtime = fakeAcceptanceRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const browser = new Browser();
    await browser.openAcceptance();
    expect((await browser.acceptOffer()).status).toBe(200);
    const now = Date.now();
    const spy = jest.spyOn(Date, "now").mockReturnValue(now + 11 * 60 * 1000);
    try {
      const late = await browser.authorizeAccept({ object_id: UNIT });
      expect(late).toMatchObject({
        status: 400,
        body: { code: "invalid_request" },
      });
      expect(late.body).not.toHaveProperty("assertion");
      expect(await browser.acceptOffer()).toMatchObject({
        status: 400,
        body: { code: "invalid_request" },
      });
      expect(runtime.calls).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  it.each([
    [
      "the offer's own holder",
      [409, { ok: false, status: "transfer_recipient_is_holder" }],
      undefined,
      409,
      "already_registered_to_you",
    ],
    [
      "a cancelled offer",
      [409, { ok: false, status: "transfer_offer_cancelled" }],
      undefined,
      409,
      "transfer_cancelled",
    ],
    [
      "an offer another wallet accepted",
      [409, { ok: false, status: "transfer_offer_used" }],
      undefined,
      409,
      "transfer_cancelled",
    ],
    [
      "a used or expired acceptance ticket",
      [410, { ok: false, status: "face_accept_ticket_expired" }],
      undefined,
      409,
      "invalid_request",
    ],
    [
      "a ticket from before r19 (no unit)",
      [409, { ok: false, status: "face_accept_ticket_unbound" }],
      undefined,
      409,
      "invalid_request",
    ],
    [
      "an unavailable runtime",
      [503, { ok: false, status: "face_runtime_unprovisioned" }],
      undefined,
      503,
      "runtime_unavailable",
    ],
    [
      "an answer without a unit",
      [200, { ok: true, status: "transfer_acceptance" }],
      undefined,
      409,
      "invalid_request",
    ],
    [
      "a unit of another programme",
      undefined,
      offeredUnit({ templateId: TEMPLATE_B }),
      404,
      "not_in_programme",
    ],
    [
      "a projection of another unit",
      undefined,
      offeredUnit({ id: OTHER_UNIT }),
      404,
      "not_in_programme",
    ],
    [
      "a unit this wallet already holds",
      undefined,
      offeredUnit({ owner: HOLDER }),
      409,
      "already_registered_to_you",
    ],
  ] as const)(
    "names nothing and binds nothing for %s",
    async (_label, answer, publicUnit, status, code) => {
      const runtime = fakeAcceptanceRuntime(
        answer ? () => [answer[0], answer[1]] : undefined,
      );
      global.fetch = runtime.fetchImpl as unknown as typeof fetch;
      if (publicUnit) getObjectByIdPublic.mockResolvedValue(publicUnit);
      const browser = new Browser();
      await browser.openAcceptance();
      const result = await browser.acceptOffer();
      expect(result).toMatchObject({ status, body: { code } });
      expect(result.body).not.toHaveProperty("unit");
      expectNothingPrivate(result.text);
      // Nothing was bound: no acceptance is minted for any unit.
      for (const objectId of [UNIT, OTHER_UNIT]) {
        expect(
          (await browser.authorizeAccept({ object_id: objectId })).body,
        ).not.toHaveProperty("assertion");
      }
    },
  );
});
