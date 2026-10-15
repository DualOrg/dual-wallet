/**
 * @jest-environment node
 */
// A branded host's journeys are enforced in the face BFF itself: a disabled
// journey's routes and operations are refused in resolveFaceRequest, before
// any route logic runs, so nothing is journaled, read from a runtime or
// minted for them.
import { generateKeyPairSync } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_ORGANIZATION_ID } from "@/api/tenant";
import type { HostJourneys } from "@/app/_domain/wallet-host";
import { edit, HOLDER } from "@/test/product-face-fixtures";
import {
  applyHostEnvironment,
  clearHostEnvironment,
  hostEnvironment,
  morrowDocument,
  registryWithBothFaces,
} from "@/test/wallet-host-fixtures";

const getWallet = jest.fn();
const getObjectById = jest.fn();
const getObjectByIdPublic = jest.fn();
jest.mock("@/api/web-sdk-client", () => ({
  getWalletsApi: () => ({ getWallet, logout: jest.fn() }),
  getObjectsApi: () => ({ getObjectById, getObjectByIdPublic }),
}));
// The pinned artifact itself is verified in api/face-artifact.test.ts.
jest.mock("@/api/face-artifact", () => ({
  ...jest.requireActual("@/api/face-artifact"),
  verifyFaceArtifact: async () => ({ ok: true }),
}));
const minted = jest.fn();
jest.mock("@/api/face-assertion", () => {
  const actual = jest.requireActual("@/api/face-assertion");
  return {
    ...actual,
    mintFaceAssertion: (...args: unknown[]) => {
      minted(...args);
      return actual.mintFaceAssertion(...args);
    },
  };
});

import {
  emptyFaceJournal,
  writeFaceJournal,
  type FaceJournal,
} from "@/api/face-journal";
import {
  establishSessionState,
  sessionIdHash,
  type SessionState,
} from "@/api/server-session";
import { resetIssueGuard } from "@/api/product-face-operations";
import { resolveFaceRequest } from "@/api/product-face-server";
import { resetWalletHostCache } from "@/api/wallet-host";
import type { LoginOut } from "@/api/web-sdk/models/LoginOut";
import { POST as backendPOST } from "@/app/api/backend/[...path]/route";
import { proxy } from "@/proxy";
import { POST as acceptOfferPOST } from "@/app/api/faces/[slug]/accept-offer/route";
import { POST as assertionsPOST } from "@/app/api/faces/[slug]/assertions/route";
import { GET as contextGET } from "@/app/api/faces/[slug]/context/route";
import { POST as handoverPOST } from "@/app/api/faces/[slug]/handover/route";
import {
  GET as operationsGET,
  POST as operationsPOST,
} from "@/app/api/faces/[slug]/operations/route";
import { GET as statusGET } from "@/app/api/faces/[slug]/operations/[operationId]/route";
import { POST as selectionPOST } from "@/app/api/faces/[slug]/selection/route";
import { POST as settlePOST } from "@/app/api/faces/[slug]/settle-proposal/route";
import { POST as transferProgressPOST } from "@/app/api/faces/[slug]/transfer-progress/route";
import { POST as transferProposalPOST } from "@/app/api/faces/[slug]/transfer-proposal/route";
import { GET as unitsGET } from "@/app/api/faces/[slug]/units/[objectId]/route";

const SLUG = "morrow-home";
const UNIT = "aaaaaaaaaaaaaaaaaaaaaaaa";
const REQUEST_HASH = `sha256:${"d".repeat(64)}`;
const keys = generateKeyPairSync("ed25519");

function jwt(claims: Record<string, unknown>) {
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
}

/** A local fixture host on http://localhost bound to the test organisation. */
function configure(journeys: Partial<HostJourneys> = {}) {
  const document = morrowDocument();
  edit(document, "entrance.origin", "http://localhost");
  edit(document, "entrance.organizationId", DEFAULT_ORGANIZATION_ID);
  edit(document, "navigation", []);
  const enabled = {
    ...(document.journeys as HostJourneys),
    ...journeys,
  };
  edit(document, "journeys", enabled);
  edit(
    document,
    "home.primaryJourney",
    (Object.keys(enabled) as (keyof HostJourneys)[]).find((j) => enabled[j]),
  );
  resetWalletHostCache();
  applyHostEnvironment(hostEnvironment(document));
}

class Browser {
  cookies = new Map<string, string>();
  launchId = `launch-${"x".repeat(28)}`;
  state: SessionState;

  constructor() {
    const response = NextResponse.json({});
    this.state = establishSessionState(
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
    )!;
    this.take(response);
  }

  /** Seals a launch journal for this session, as the BFF itself would. */
  keepJournal(journal: FaceJournal) {
    const response = NextResponse.json({});
    writeFaceJournal(
      response,
      new NextRequest("http://localhost/api/faces/morrow-home/operations"),
      {
        owner: { sidHash: sessionIdHash(this.state)!, walletId: "wallet-1" },
        launchId: this.launchId,
        slug: SLUG,
        programmeId: "morrow-home-arc",
      },
      journal,
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

  async call<P>(
    handler: (
      request: NextRequest,
      context: { params: Promise<P> },
    ) => Promise<Response>,
    path: string,
    params: P,
    body?: unknown,
    extra: Record<string, string> = {},
  ) {
    const request = new NextRequest(`http://localhost${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        host: "localhost",
        origin: "http://localhost",
        cookie: Array.from(this.cookies, ([k, v]) => `${k}=${v}`).join("; "),
        "x-dual-face-launch": this.launchId,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const response = this.take(
      await handler(request, { params: Promise.resolve(params) }),
    );
    return { status: response.status, body: await response.json() };
  }
}

const face = (route: string) => `/api/faces/${SLUG}${route}`;
const slug = { slug: SLUG };
const REFUSED = {
  status: 403,
  body: expect.objectContaining({ code: "capability_not_granted" }),
};

const original = global.fetch;
const runtime = jest.fn();
beforeEach(() => {
  process.env.FACE_ASSERTION_KEY_ID = "wallet-face-test";
  process.env.FACE_ASSERTION_SIGNING_KEY = keys.privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString();
  resetIssueGuard();
  minted.mockReset();
  runtime.mockReset().mockRejectedValue(new TypeError("fetch failed"));
  global.fetch = runtime as unknown as typeof fetch;
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
      controller: { address: "0xc", type: "SECP256K1", custody: "custodial" },
      smartAccount: {},
    },
    whenCreated: new Date(),
    whenModified: new Date(),
  });
  getObjectById.mockReset();
  getObjectByIdPublic.mockReset().mockResolvedValue({
    id: UNIT,
    templateId: "65f0a1b2c3d4e5f6a7b8c9d0",
    owner: "0xissuer",
    custom: { recordId: "rec-0001", state: "Registered" },
    metadata: { name: "Arc grinder" },
    whenModified: new Date("2026-10-01T00:00:00Z"),
  });
});
afterEach(() => {
  global.fetch = original;
  clearHostEnvironment();
  resetWalletHostCache();
  delete process.env.FACE_ASSERTION_KEY_ID;
  delete process.env.FACE_ASSERTION_SIGNING_KEY;
});

const offerRead = {
  operation: "transfer.offer.read",
  operation_id: "transfer-op-0001",
  target: {},
  request_hash: REQUEST_HASH,
};

describe("disabled journeys in the face BFF", () => {
  it("refuses a disabled journey's assertion before anything is minted; the same request mints once enabled", async () => {
    configure({ transfer: false });
    const browser = new Browser();
    expect(
      await browser.call(assertionsPOST, face("/assertions"), slug, offerRead),
    ).toEqual(REFUSED);
    expect(minted).not.toHaveBeenCalled();

    configure({ transfer: true });
    const allowed = await browser.call(
      assertionsPOST,
      face("/assertions"),
      slug,
      offerRead,
    );
    expect(allowed.status).toBe(200);
    expect(allowed.body.assertion).toEqual(expect.any(String));
    expect(minted).toHaveBeenCalledTimes(1);
  });

  it("registration: its journal, assertions, settle, unit and status reads are refused", async () => {
    configure({ registration: false });
    const browser = new Browser();
    const begin = {
      transition: "begin",
      kind: "registration",
      operation: "registration.submit",
      operation_id: "register-op-0001",
      object_id: UNIT,
      record_id: "rec-0001",
      request_hash: REQUEST_HASH,
    };
    expect(
      await browser.call(operationsPOST, face("/operations"), slug, begin),
    ).toEqual(REFUSED);
    expect(
      await browser.call(operationsPOST, face("/operations"), slug, {
        ...begin,
        kind: "settle",
        operation: "update",
      }),
    ).toEqual(REFUSED);
    for (const operation of [
      "registration.submit",
      "registration.status",
      "registration.settle.verify",
      "registration.pending.read",
    ]) {
      expect(
        await browser.call(assertionsPOST, face("/assertions"), slug, {
          operation,
          operation_id: "register-op-0001",
          target: { object_id: UNIT },
          request_hash: REQUEST_HASH,
        }),
      ).toEqual(REFUSED);
    }
    expect(
      await browser.call(settlePOST, face("/settle-proposal"), slug, {
        context_id: "c".repeat(24),
        operation_id: "register-op-0001",
        object_id: UNIT,
      }),
    ).toEqual(REFUSED);
    expect(
      await browser.call(unitsGET, face(`/units/${UNIT}`), {
        slug: SLUG,
        objectId: UNIT,
      }),
    ).toEqual(REFUSED);
    expect(
      await browser.call(statusGET, face("/operations/register-op-0001"), {
        slug: SLUG,
        operationId: "register-op-0001",
      }),
    ).toEqual(REFUSED);
    // A malformed operation id is refused the same way, never an error.
    expect(
      await browser.call(statusGET, face("/operations/%E0%A4%A"), {
        slug: SLUG,
        operationId: "%E0%A4%A",
      }),
    ).toEqual(REFUSED);
    expect(getObjectByIdPublic).not.toHaveBeenCalled();
    expect(minted).not.toHaveBeenCalled();
    expect(runtime).not.toHaveBeenCalled();
    // Nothing was journaled.
    expect(
      (await browser.call(operationsGET, face("/operations"), slug)).body,
    ).toEqual({ operations: [] });

    // Enabled, the same journal step reaches the route (the public unit read).
    configure({ registration: true });
    const begun = await browser.call(
      operationsPOST,
      face("/operations"),
      slug,
      begin,
    );
    expect(begun.status).toBe(200);
    expect(getObjectByIdPublic).toHaveBeenCalledWith(
      { objectId: UNIT },
      { cache: "no-store" },
    );
  });

  it("service and quotes: each is refused on its own", async () => {
    configure({ serviceProgress: false, quoteDecisions: false });
    const browser = new Browser();
    expect(
      await browser.call(operationsPOST, face("/operations"), slug, {
        transition: "begin",
        kind: "runtime",
        operation: "case.open",
        operation_id: "case-op-00001",
        object_id: UNIT,
        context_id: "c".repeat(24),
      }),
    ).toEqual(REFUSED);
    for (const operation of ["cases.list", "case.read", "case.quote.approve"]) {
      expect(
        await browser.call(assertionsPOST, face("/assertions"), slug, {
          operation,
          operation_id: "case-op-00001",
          target: { object_id: UNIT, case_id: "case-1" },
          request_hash: REQUEST_HASH,
          context_id: "c".repeat(24),
        }),
      ).toEqual(REFUSED);
    }
    expect(getObjectById).not.toHaveBeenCalled();

    // Service on, quotes off: a quote decision alone is refused, while a
    // case read passes the journey check and meets the route's own checks.
    configure({ quoteDecisions: false });
    expect(
      await browser.call(operationsPOST, face("/operations"), slug, {
        transition: "begin",
        kind: "runtime",
        operation: "case.quote.decline",
        operation_id: "case-op-00002",
        object_id: UNIT,
        case_id: "case-1",
        context_id: "c".repeat(24),
      }),
    ).toEqual(REFUSED);
    expect(
      await browser.call(assertionsPOST, face("/assertions"), slug, {
        operation: "cases.list",
        operation_id: "case-op-00003",
        target: { object_id: UNIT },
        request_hash: REQUEST_HASH,
        context_id: "c".repeat(24),
      }),
    ).toEqual({
      status: 409,
      body: expect.objectContaining({ code: "stale_context" }),
    });
    expect(minted).not.toHaveBeenCalled();
  });

  it("my products: the private product read is refused", async () => {
    configure({ myProducts: false });
    expect(
      await new Browser().call(assertionsPOST, face("/assertions"), slug, {
        operation: "products.private.read",
        operation_id: "product-op-001",
        target: { object_id: UNIT },
        request_hash: REQUEST_HASH,
        context_id: "c".repeat(24),
      }),
    ).toEqual(REFUSED);
    expect(minted).not.toHaveBeenCalled();
  });

  it("transfer: its routes, journal steps, assertions and acceptance tickets are refused", async () => {
    configure({ transfer: false });
    const browser = new Browser();
    for (const [handler, route] of [
      [transferProposalPOST, "/transfer-proposal"],
      [transferProgressPOST, "/transfer-progress"],
      [acceptOfferPOST, "/accept-offer"],
    ] as const) {
      expect(
        await browser.call(handler, face(route), slug, {
          context_id: "c".repeat(24),
          object_id: UNIT,
        }),
      ).toEqual(REFUSED);
    }
    expect(
      await browser.call(operationsPOST, face("/operations"), slug, {
        transition: "begin",
        kind: "transfer",
        operation: "transfer.request",
        operation_id: "transfer-op-0002",
        object_id: UNIT,
        context_id: "c".repeat(24),
        proposal_id: "p".repeat(16),
        offer_id: "o".repeat(16),
      }),
    ).toEqual(REFUSED);
    for (const operation of ["transfer.offer", "transfer.accept"]) {
      expect(
        await browser.call(assertionsPOST, face("/assertions"), slug, {
          operation,
          operation_id: "transfer-op-0003",
          target: { object_id: UNIT },
          request_hash: REQUEST_HASH,
        }),
      ).toEqual(REFUSED);
    }
    // The acceptance entry keeps no ticket; a registration handover still works.
    const ticket = "t".repeat(43);
    expect(
      await browser.call(handoverPOST, face("/handover"), slug, {
        ticket,
        kind: "accept",
      }),
    ).toEqual({
      status: 404,
      body: expect.objectContaining({ code: "handover_unavailable" }),
    });
    expect(
      await browser.call(handoverPOST, face("/handover"), slug, { ticket }),
    ).toEqual({ status: 200, body: { next: `/products/${SLUG}/register` } });
    expect(minted).not.toHaveBeenCalled();
    expect(runtime).not.toHaveBeenCalled();
  });

  it("shared face machinery stays available on every configured host", async () => {
    configure({
      transfer: false,
      serviceProgress: false,
      quoteDecisions: false,
    });
    const browser = new Browser();
    expect(
      await browser.call(selectionPOST, face("/selection"), slug, {
        object_id: null,
      }),
    ).toEqual({ status: 200, body: { context_id: null, product: null } });
    expect(
      await browser.call(operationsGET, face("/operations"), slug),
    ).toEqual({ status: 200, body: { operations: [] } });
  });

  it("a face that is not this host's is unknown, even when the registry has it", async () => {
    configure();
    const browser = new Browser();
    expect(
      await browser.call(
        selectionPOST,
        "/api/faces/tidewell-care/selection",
        { slug: "tidewell-care" },
        { object_id: null },
      ),
    ).toEqual({
      status: 404,
      body: expect.objectContaining({ code: "unknown_application" }),
    });
    expect(
      await browser.call(
        handoverPOST,
        "/api/faces/tidewell-care/handover",
        { slug: "tidewell-care" },
        { ticket: "t".repeat(43) },
      ),
    ).toEqual({
      status: 404,
      body: expect.objectContaining({ code: "handover_unavailable" }),
    });
  });
});

describe("without a host configuration", () => {
  it("every journey's operation is served exactly as before", async () => {
    clearHostEnvironment();
    process.env.PRODUCT_FACE_APPLICATIONS = registryWithBothFaces();
    resetWalletHostCache();
    const browser = new Browser();
    const result = await browser.call(
      assertionsPOST,
      face("/assertions"),
      slug,
      offerRead,
    );
    expect(result.status).toBe(200);
    expect(minted).toHaveBeenCalledTimes(1);
    // Both registry faces are served.
    expect(
      (
        await browser.call(
          selectionPOST,
          "/api/faces/tidewell-care/selection",
          { slug: "tidewell-care" },
          { object_id: null },
        )
      ).status,
    ).toBe(200);
  });
});

// B1: a face request is classified by the route that serves it. An entry-link
// prefix (/<organisation>/api/faces/...) used to reach the handlers with a
// path the classifier did not recognise, which counted as "no journey".
describe("the route a face request is served by, not its path", () => {
  const PREFIX = `/${DEFAULT_ORGANIZATION_ID}`;
  const prefixed = (route: string) => `${PREFIX}${face(route)}`;

  it("refuses an entry-prefixed path of a disabled journey; nothing is minted or read", async () => {
    configure({ registration: false, transfer: false });
    const browser = new Browser();
    expect(
      await browser.call(
        assertionsPOST,
        prefixed("/assertions"),
        slug,
        offerRead,
      ),
    ).toEqual(REFUSED);
    expect(
      await browser.call(operationsPOST, prefixed("/operations"), slug, {
        transition: "begin",
        kind: "registration",
        operation: "registration.submit",
        operation_id: "register-op-0001",
        object_id: UNIT,
        record_id: "rec-0001",
        request_hash: REQUEST_HASH,
      }),
    ).toEqual(REFUSED);
    for (const [handler, route] of [
      [transferProposalPOST, "/transfer-proposal"],
      [acceptOfferPOST, "/accept-offer"],
      [settlePOST, "/settle-proposal"],
    ] as const) {
      expect(
        await browser.call(handler, prefixed(route), slug, {
          context_id: "c".repeat(24),
          operation_id: "register-op-0001",
          object_id: UNIT,
        }),
      ).toEqual(REFUSED);
    }
    expect(minted).not.toHaveBeenCalled();
    expect(getObjectByIdPublic).not.toHaveBeenCalled();
    expect(getObjectById).not.toHaveBeenCalled();
    expect(runtime).not.toHaveBeenCalled();
  });

  it("classifies the journal and assertion routes only at their own path", async () => {
    configure();
    const browser = new Browser();
    // Every journey enabled: the prefixed path is still not one of them.
    expect(
      await browser.call(
        assertionsPOST,
        prefixed("/assertions"),
        slug,
        offerRead,
      ),
    ).toEqual(REFUSED);
    expect(
      await browser.call(
        assertionsPOST,
        face("/%61ssertions"),
        slug,
        offerRead,
      ),
    ).toEqual(REFUSED);
    expect(
      await browser.call(operationsGET, prefixed("/operations"), slug),
    ).toEqual(REFUSED);
    expect(minted).not.toHaveBeenCalled();
    // The canonical paths are unchanged.
    expect(
      (await browser.call(assertionsPOST, face("/assertions"), slug, offerRead))
        .status,
    ).toBe(200);
    expect(minted).toHaveBeenCalledTimes(1);
    expect(
      await browser.call(operationsGET, face("/operations"), slug),
    ).toEqual({ status: 200, body: { operations: [] } });
  });

  it("refuses any face request it cannot classify on an active host", async () => {
    configure();
    const browser = new Browser();
    // An operation the contract does not name.
    expect(
      await browser.call(assertionsPOST, face("/assertions"), slug, {
        ...offerRead,
        operation: "wallet.everything",
      }),
    ).toEqual(REFUSED);
    // A journal step of no journey.
    expect(
      await browser.call(operationsPOST, face("/operations"), slug, {
        transition: "confirm",
        operation_id: "never-begun-001",
      }),
    ).toEqual(REFUSED);
    // A caller that names no route, on a path that is not one.
    const unnamed = await resolveFaceRequest(
      new NextRequest(`http://localhost${face("/unknown")}`, {
        headers: {
          host: "localhost",
          cookie: Array.from(browser.cookies, ([k, v]) => `${k}=${v}`).join(
            "; ",
          ),
          "x-dual-face-launch": browser.launchId,
        },
      }),
      SLUG,
    );
    expect(unnamed).toBeInstanceOf(NextResponse);
    expect((unnamed as NextResponse).status).toBe(403);
    expect(minted).not.toHaveBeenCalled();
  });

  it("refuses face execution through /api/backend for a disabled journey's step, before any upstream call", async () => {
    const now = Date.now();
    const step = (kind: "settle" | "transfer") => ({
      operationId: `${kind}-step-0001`,
      kind,
      operation: kind === "settle" ? "update" : "transfer.request",
      slug: SLUG,
      programmeId: "morrow-home-arc",
      objectId: UNIT,
      phase: "submitted" as const,
      dispatch: "won" as const,
      proposalId: "proposal-0001",
      ...(kind === "transfer" ? { offerId: `pto-${"a".repeat(24)}` } : {}),
      createdAt: now,
      updatedAt: now,
    });
    const execute = (browser: Browser, operationId: string) =>
      browser.call(
        backendPOST,
        "/api/backend/ebus/prepare",
        { path: ["ebus", "prepare"] },
        { action: { update: { id: UNIT } } },
        {
          "x-dual-face-slug": SLUG,
          "x-dual-face-operation": operationId,
          "x-dual-face-wallet": "wallet-1",
        },
      );
    for (const [kind, journey] of [
      ["settle", "registration"],
      ["transfer", "transfer"],
    ] as const) {
      configure({ [journey]: false });
      const browser = new Browser();
      browser.keepJournal({
        ...emptyFaceJournal(),
        entries: [step(kind)],
      });
      expect(await execute(browser, `${kind}-step-0001`)).toEqual(REFUSED);
      expect(runtime).not.toHaveBeenCalled();

      // Enabled, the same step passes the journey check and the execution
      // binding, and is forwarded to Dual's prepare (unreachable here).
      configure({ [journey]: true });
      expect((await execute(browser, `${kind}-step-0001`)).status).toBe(502);
      expect(runtime).toHaveBeenCalledTimes(1);
      expect(String(runtime.mock.calls[0][0])).toMatch(/\/ebus\/prepare$/);
      runtime.mockClear();
    }
  });
});

describe("the context read on a branded host", () => {
  it("hands over no acceptance ticket while transfer is disabled, and keeps it", async () => {
    configure();
    const browser = new Browser();
    const ticket = "t".repeat(43);
    expect(
      (
        await browser.call(handoverPOST, face("/handover"), slug, {
          ticket,
          kind: "accept",
        })
      ).status,
    ).toBe(200);
    const read = () =>
      browser.call(contextGET, `${face("/context")}?task=%2Faccept`, slug);

    configure({ transfer: false });
    const withheld = await read();
    expect(withheld.status).toBe(200);
    expect(withheld.body).not.toHaveProperty("acceptance");

    // Not consumed: once transfer is served again, it is handed over once.
    configure();
    const handed = await read();
    expect(handed.body.acceptance).toEqual({ ticket });
    expect((await read()).body).not.toHaveProperty("acceptance");
  });
});

describe("prefixed paths without a host configuration", () => {
  it("reach the handlers exactly as before", async () => {
    clearHostEnvironment();
    process.env.PRODUCT_FACE_APPLICATIONS = registryWithBothFaces();
    resetWalletHostCache();
    const browser = new Browser();
    // The generic wallet never classifies face requests: the prefixed path
    // is served by its handler as it was at 89b5700.
    const result = await browser.call(
      assertionsPOST,
      `/${DEFAULT_ORGANIZATION_ID}${face("/assertions")}`,
      slug,
      offerRead,
    );
    expect(result.status).toBe(200);
    expect(minted).toHaveBeenCalledTimes(1);
    // An operation the contract does not name is the route's own 400.
    expect(
      await browser.call(assertionsPOST, face("/assertions"), slug, {
        ...offerRead,
        operation: "wallet.everything",
      }),
    ).toEqual({
      status: 400,
      body: expect.objectContaining({ code: "invalid_request" }),
    });
  });
});

// B2: the request proxy decides on a backend write's body, and the backend
// route forwards that request's raw bytes to Dual. On a host without the
// transfer journey a body it refuses never reaches the route or Dual; a body
// it passes reaches Dual byte for byte, so what was checked is what is sent.
describe("native custody through /api/backend: the proxy decides on exactly the bytes the route forwards", () => {
  const T = `{"id":"${UNIT}","to":"0x1234567890abcdef1234567890abcdef12345678"}`;
  async function send(browser: Browser, raw: string) {
    const request = () =>
      new NextRequest("http://localhost/api/backend/ebus/execute", {
        method: "POST",
        headers: {
          host: "localhost",
          origin: "http://localhost",
          cookie: Array.from(browser.cookies, ([k, v]) => `${k}=${v}`).join(
            "; ",
          ),
          "content-type": "application/json",
        },
        body: raw,
      });
    const gate = await proxy(request());
    if (gate.headers.get("x-middleware-next") !== "1") {
      return { gate: gate.status, code: (await gate.json()).code };
    }
    const routed = await backendPOST(request(), {
      params: Promise.resolve({ path: ["ebus", "execute"] }),
    });
    return { gate: 200, routed: routed.status };
  }
  const forwarded = () =>
    runtime.mock.calls.map(([url, init]) => [
      String(url).replace(/^.*\/ebus\//, "/ebus/"),
      Buffer.from((init as RequestInit).body as ArrayBuffer).toString("utf8"),
    ]);
  beforeEach(() => {
    runtime.mockImplementation(
      async () =>
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
  });

  it("a refused body reaches neither the route nor Dual; an allowed body reaches Dual byte for byte", async () => {
    configure({ transfer: false });
    const browser = new Browser();
    for (const raw of [
      `{"action":{"transfer":${T}},"action":{}}`,
      `{"action":{"transfer":${T}},"action":{"update":{"id":"${UNIT}"}},"nonce":9}`,
      `[{"action":{"transfer":${T}},"nonce":9}]`,
      `{"\\u0061ction":{"\\u0074ransfer":${T}},"nonce":9}`,
      `{"action":{"drop":{"id":"${UNIT}","latitude":1,"longitude":2}},"nonce":9}`,
      `{"action":{"pickup":{"id":"${UNIT}"}},"nonce":9}`,
      `{"action":{"claim_ownership":{"id":"${UNIT}"}},"nonce":9}`,
      `{"action":{"permit":{"id":"${UNIT}","scope":"transfer","commitment":"c"}},"nonce":9}`,
      `{"action":{"teleport":{"id":"${UNIT}"}},"nonce":9}`,
    ]) {
      expect(await send(browser, raw)).toEqual({
        gate: 403,
        code: "capability_not_granted",
      });
    }
    expect(runtime).not.toHaveBeenCalled();
    // Spacing and key order as the client sent them: forwarded unchanged.
    const allowed = `{ "action" : {"update":{"id":"${UNIT}","data":{"custom":{"transfer":"not an action"}}}}, "nonce": 9 }`;
    expect(await send(browser, allowed)).toEqual({ gate: 200, routed: 200 });
    expect(forwarded()).toEqual([["/ebus/execute", allowed]]);
  });

  it("a host with transfer enabled forwards exactly what it is sent, unchanged", async () => {
    configure({ transfer: true });
    const browser = new Browser();
    const raw = `{"action":{"transfer":${T}},"nonce":9}`;
    expect(await send(browser, raw)).toEqual({ gate: 200, routed: 200 });
    expect(forwarded()).toEqual([["/ebus/execute", raw]]);
  });
});

// The backend route decides on its own, on exactly the bytes it forwards; the
// request proxy is NOT invoked here (it need not run for every spelling of
// the path). A face-bound step is read unambiguously from those bytes on every
// host, a transfer-disabled brand host refuses custody and ambiguous bodies,
// and the generic executor without face headers is forwarded as before.
describe("the backend route decides on exactly the bytes it forwards, without the proxy", () => {
  const RECIPIENT = "0x1234567890abcdef1234567890abcdef12345678";
  const T = `{"id":"${UNIT}","to":"${RECIPIENT}"}`;
  const OTHER_UNIT = "b".repeat(24);
  const utf8 = (text: string) => Buffer.from(text, "utf8");
  /** Valid JSON text around one byte that is not UTF-8. */
  const notUtf8 = (before: string, after: string) =>
    Buffer.concat([utf8(before), Buffer.from([0xff]), utf8(after)]);

  async function route(
    browser: Browser,
    path: string[],
    raw: string | Buffer,
    face: Record<string, string> = {},
  ) {
    const response = await backendPOST(
      new NextRequest(`http://localhost/api/backend/${path.join("/")}`, {
        method: "POST",
        headers: {
          host: "localhost",
          origin: "http://localhost",
          cookie: Array.from(browser.cookies, ([k, v]) => `${k}=${v}`).join(
            "; ",
          ),
          "content-type": "application/json",
          ...face,
        },
        body: typeof raw === "string" ? raw : new Uint8Array(raw),
      }),
      { params: Promise.resolve({ path }) },
    );
    const body = (await response.json().catch(() => null)) as {
      code?: string;
    } | null;
    return { status: response.status, code: body?.code };
  }
  /** What reached Dual: each call's path and its exact bytes. */
  const forwarded = () =>
    runtime.mock.calls.map(([url, init]) => [
      String(url).replace(/^.*\/ebus\//, "/ebus/"),
      Buffer.from((init as RequestInit).body as ArrayBuffer),
    ]);
  function generic() {
    clearHostEnvironment();
    process.env.PRODUCT_FACE_APPLICATIONS = registryWithBothFaces();
    resetWalletHostCache();
  }
  beforeEach(() => {
    runtime.mockImplementation(
      async () =>
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
  });

  // B2's custody and ambiguity bodies, as the route alone receives them.
  const refusedOnTransferDisabledHost: Array<[string, string | Buffer]> = [
    ["a transfer", `{"action":{"transfer":${T}},"nonce":9}`],
    [
      "a drop",
      `{"action":{"drop":{"id":"${UNIT}","latitude":1,"longitude":2}},"nonce":9}`,
    ],
    ["a pickup", `{"action":{"pickup":{"id":"${UNIT}"}},"nonce":9}`],
    [
      "a claim_ownership",
      `{"action":{"claim_ownership":{"id":"${UNIT}"}},"nonce":9}`,
    ],
    [
      "a permit delegating transfer",
      `{"action":{"permit":{"id":"${UNIT}","scope":"transfer","commitment":"c"}},"nonce":9}`,
    ],
    ["an unknown action", `{"action":{"teleport":{"id":"${UNIT}"}},"nonce":9}`],
    [
      "a duplicate action",
      `{"action":{"transfer":${T}},"action":{"update":{"id":"${UNIT}"}},"nonce":9}`,
    ],
    [
      "an escaped duplicate action",
      `{"\\u0061ction":{"transfer":${T}},"action":{"update":{"id":"${UNIT}"}},"nonce":9}`,
    ],
    [
      "a case-folded duplicate action",
      `{"ACTION":{"transfer":${T}},"action":{"update":{"id":"${UNIT}"}},"nonce":9}`,
    ],
    [
      "a nested duplicate (permit scope)",
      `{"action":{"permit":{"id":"${UNIT}","scope":"transfer","scope":"update","commitment":"c"}},"nonce":9}`,
    ],
    ["a top-level array", `[{"action":{"transfer":${T}},"nonce":9}]`],
    [
      "invalid UTF-8",
      notUtf8(`{"action":{"update":{"id":"${UNIT}"}},"memo":"`, `","nonce":9}`),
    ],
    ["a truncated body", `{"action":{"update":{"id":"${UNIT}"}},"nonce":9`],
  ];

  it.each(refusedOnTransferDisabledHost)(
    "a transfer-disabled brand host refuses %s in the route, with no upstream call",
    async (_label, raw) => {
      configure({ transfer: false });
      const browser = new Browser();
      expect(await route(browser, ["ebus", "execute"], raw)).toEqual({
        status: 403,
        code: "capability_not_granted",
      });
      expect(await route(browser, ["ebus", "prepare"], raw)).toEqual({
        status: 403,
        code: "capability_not_granted",
      });
      expect(runtime).not.toHaveBeenCalled();
      expect(getWallet).not.toHaveBeenCalled();
    },
  );

  it("a transfer-disabled brand host forwards an allowed body byte for byte, spacing and all", async () => {
    configure({ transfer: false });
    const browser = new Browser();
    const allowed = `{ "action" : {"update":{"id":"${UNIT}","data":{"custom":{"transfer":"not an action"}}}}, "nonce": 9 }`;
    expect(await route(browser, ["ebus", "execute"], allowed)).toEqual({
      status: 200,
      code: undefined,
    });
    expect(forwarded()).toEqual([["/ebus/execute", utf8(allowed)]]);
  });

  it.each([
    ["the generic wallet", generic],
    ["a transfer-enabled brand host", () => configure({ transfer: true })],
  ])(
    "%s forwards a request without face headers byte for byte, ambiguous or not",
    async (_label, setUp) => {
      setUp();
      const browser = new Browser();
      const bodies = [
        `{"action":{"transfer":${T}},"action":{"update":{"id":"${UNIT}"}},"nonce":9}`,
        `{"\\u0061ction":{"transfer":${T}},"action":{"update":{"id":"${UNIT}"}},"nonce":9}`,
        `[{"action":{"transfer":${T}},"nonce":9}]`,
        notUtf8(`{"action":{"transfer":${T}},"memo":"`, `","nonce":9}`),
      ];
      for (const raw of bodies) {
        expect(await route(browser, ["ebus", "execute"], raw)).toEqual({
          status: 200,
          code: undefined,
        });
      }
      expect(forwarded()).toEqual(
        bodies.map((raw) => ["/ebus/execute", Buffer.from(raw)]),
      );
    },
  );

  describe.each([
    ["the generic wallet", generic],
    ["a transfer-enabled brand host", () => configure()],
  ])("a face-bound step on %s", (_host, setUp) => {
    const now = Date.now();
    const steps = {
      settle: {
        entry: {
          operationId: "settle-step-0001",
          kind: "settle" as const,
          operation: "update",
        },
        action: `{"update":{"id":"${UNIT}","data":{"custom":{"state":"Registered"}}}}`,
        nested: `{"update":{"id":"${OTHER_UNIT}","id":"${UNIT}"}}`,
        folded: `{"update":{"ID":"${OTHER_UNIT}","id":"${UNIT}"}}`,
      },
      transfer: {
        entry: {
          operationId: "transfer-step-0001",
          kind: "transfer" as const,
          operation: "transfer.transfer",
          offerId: `pto-${"a".repeat(24)}`,
        },
        action: `{"transfer":${T}}`,
        nested: `{"transfer":{"id":"${OTHER_UNIT}","id":"${UNIT}","to":"${RECIPIENT}"}}`,
        folded: `{"transfer":{"ID":"${OTHER_UNIT}","id":"${UNIT}","to":"${RECIPIENT}"}}`,
      },
    };
    function bound(kind: keyof typeof steps) {
      setUp();
      const browser = new Browser();
      browser.keepJournal({
        ...emptyFaceJournal(),
        entries: [
          {
            ...steps[kind].entry,
            slug: SLUG,
            programmeId: "morrow-home-arc",
            objectId: UNIT,
            phase: "submitted",
            dispatch: "won",
            proposalId: "proposal-0001",
            createdAt: now,
            updatedAt: now,
          },
        ],
      });
      const face = {
        "x-dual-face-launch": browser.launchId,
        "x-dual-face-slug": SLUG,
        "x-dual-face-operation": steps[kind].entry.operationId,
        "x-dual-face-wallet": "wallet-1",
      };
      return { browser, face, step: steps[kind] };
    }
    const BURN = `{"burn":{"id":"${UNIT}"}}`;
    const ambiguous = (step: (typeof steps)[keyof typeof steps]) =>
      [
        [
          "a duplicate action",
          `{"action":${BURN},"action":${step.action},"nonce":3}`,
        ],
        [
          "an escaped duplicate action",
          `{"\\u0061ction":${BURN},"action":${step.action},"nonce":3}`,
        ],
        [
          "a case-folded duplicate action",
          `{"ACTION":${BURN},"action":${step.action},"nonce":3}`,
        ],
        ["a nested duplicate", `{"action":${step.nested},"nonce":3}`],
        [
          "a case-folded nested duplicate",
          `{"action":${step.folded},"nonce":3}`,
        ],
        ["a top-level array", `[{"action":${step.action},"nonce":3}]`],
        ["null", "null"],
        ["a number", "3"],
        ["a string", `"{\\"action\\":${step.action.replaceAll('"', '\\"')}}"`],
        [
          "invalid UTF-8",
          notUtf8(`{"action":${step.action},"memo":"`, `","nonce":3}`),
        ],
        ["a truncated body", `{"action":${step.action},"nonce":3`],
        ["no body", ""],
      ] as Array<[string, string | Buffer]>;

    it.each(["settle", "transfer"] as const)(
      "%s: every ambiguous body is refused before the session, the journal or Dual is read",
      async (kind) => {
        const { browser, face, step } = bound(kind);
        for (const [label, raw] of ambiguous(step)) {
          for (const path of [
            ["ebus", "prepare"],
            ["ebus", "execute"],
          ]) {
            expect([label, await route(browser, path, raw, face)]).toEqual([
              label,
              { status: 400, code: "face_execution_mismatch" },
            ]);
          }
        }
        expect(runtime).not.toHaveBeenCalled();
        expect(getWallet).not.toHaveBeenCalled();
      },
    );

    it.each(["settle", "transfer"] as const)(
      "%s: an unambiguous body is still held to the exact action, before Dual",
      async (kind) => {
        const { browser, face, step } = bound(kind);
        for (const raw of [
          // Mixed: the step's action and another one beside it.
          `{"action":{${step.action.slice(1, -1)},"Burn":{"id":"${UNIT}"}},"nonce":3}`,
          // Only a case-folded spelling of the action.
          `{"Action":${step.action},"nonce":3}`,
          `{"action":${BURN},"nonce":3}`,
        ]) {
          expect(await route(browser, ["ebus", "execute"], raw, face)).toEqual({
            status: 400,
            code: "face_execution_mismatch",
          });
        }
        expect(runtime).not.toHaveBeenCalled();
      },
    );

    it.each(["settle", "transfer"] as const)(
      "%s: the legitimate step is prepared and executed, forwarded byte for byte",
      async (kind) => {
        const { browser, face, step } = bound(kind);
        const prepare = `{ "action" : ${step.action} }`;
        const execute = `{"action":${step.action},"nonce":3,"auth":{"type":"webauthn","challenge":"AQID","credentialId":"c"}}`;
        expect(
          await route(browser, ["ebus", "prepare"], prepare, face),
        ).toEqual({ status: 200, code: undefined });
        expect(
          await route(browser, ["ebus", "execute"], execute, face),
        ).toEqual({ status: 200, code: undefined });
        expect(forwarded()).toEqual([
          ["/ebus/prepare", utf8(prepare)],
          ["/ebus/execute", utf8(execute)],
        ]);
      },
    );
  });
});

// Root's live blocker: an owner's transfer.request (an `update` of the unit's
// COMPLETE custom map) was refused face_execution_mismatch at ebus/prepare
// because the custom map holds both `serialNumber` and `serial_number`, two
// distinct keys of one free-form map that the guard folded into one name.
// This drives the actual path: the wallet's builder, the SDK's own
// serialization, the request proxy, then the backend route's guard, and
// checks what reached Dual byte for byte. A designated free-form map compares
// its own keys exactly; everything else is still folded, and an exact
// duplicate is refused anywhere.
describe("a face transfer.request's complete custom map reaches Dual exactly (Root blocker)", () => {
  const OFFER = `pto-${"a".repeat(24)}`;
  // Redacted but complete: every value shape a unit's custom map carries,
  // with both spellings of the serial number as the distinct keys they are.
  const CUSTOM = {
    serialNumber: "SN-REDACTED-0001",
    serial_number: "SN-REDACTED-0001",
    product_title: "Redacted product",
    productTitle: "Redacted product",
    state: "Registered",
    lifecycle: { target: null, since: "2026-10-01T00:00:00Z" },
    dual_asset: { asset_label: "REDACTED", tags: ["a", "b"], count: 2 },
    activation_hash: `sha256:${"e".repeat(64)}`,
    warranty_months: 24,
    verified: true,
    notes: null,
    owner_label: "Redacted owner é ✓",
  };
  const utf8 = (text: string) => Buffer.from(text, "utf8");

  function bound(setUp: () => void) {
    setUp();
    const browser = new Browser();
    const now = Date.now();
    browser.keepJournal({
      ...emptyFaceJournal(),
      entries: [
        {
          operationId: "transfer-request-0001",
          kind: "transfer",
          operation: "transfer.request",
          offerId: OFFER,
          slug: SLUG,
          programmeId: "morrow-home-arc",
          objectId: UNIT,
          phase: "submitted",
          dispatch: "won",
          proposalId: "proposal-0001",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const face = {
      "x-dual-face-launch": browser.launchId,
      "x-dual-face-slug": SLUG,
      "x-dual-face-operation": "transfer-request-0001",
      "x-dual-face-wallet": "wallet-1",
    };
    return { browser, face };
  }

  /** The browser's request through the request proxy, then the route. */
  async function wallet(browser: Browser, url: string, init: RequestInit) {
    const request = () =>
      new NextRequest(url, {
        method: init.method,
        headers: {
          ...(init.headers as Record<string, string>),
          host: "localhost",
          origin: "http://localhost",
          cookie: Array.from(browser.cookies, ([k, v]) => `${k}=${v}`).join(
            "; ",
          ),
        },
        body: init.body as BodyInit,
      });
    const gate = await proxy(request());
    if (gate.headers.get("x-middleware-next") !== "1") return gate;
    const path = new URL(url).pathname
      .replace(/^\/api\/backend\//, "")
      .split("/");
    return backendPOST(request(), { params: Promise.resolve({ path }) });
  }

  async function route(
    browser: Browser,
    path: string[],
    raw: string,
    headers: Record<string, string>,
  ) {
    const response = await wallet(
      browser,
      `http://localhost/api/backend/${path.join("/")}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: raw,
      },
    );
    const body = (await response.json().catch(() => null)) as {
      code?: string;
    } | null;
    return {
      status: response.status,
      code: body?.code,
      cookie: response.headers.get("set-cookie"),
    };
  }

  const forwarded = () =>
    runtime.mock.calls.map(([url, init]) => [
      String(url).replace(/^.*\/ebus\//, "/ebus/"),
      Buffer.from((init as RequestInit).body as ArrayBuffer),
    ]);
  beforeEach(() => {
    runtime.mockImplementation(
      async () =>
        new Response(JSON.stringify({ nonce: 3, challenge: "AQID" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
  });

  function generic() {
    clearHostEnvironment();
    process.env.PRODUCT_FACE_APPLICATIONS = registryWithBothFaces();
    resetWalletHostCache();
  }

  it.each([
    ["the generic wallet", generic],
    ["a transfer-enabled brand host", () => configure()],
  ])(
    "%s: builder -> SDK -> proxy -> route forwards the colliding custom map byte for byte",
    async (_host, setUp) => {
      const { browser, face } = bound(setUp);
      const { transferExecutorInput } =
        await import("@/app/_domain/product-face-transfer");
      const { bridgeActionInput, buildInventoryAction } =
        await import("@/app/_services/inventory-actions");
      const { EbusApi } = await import("@/api/web-sdk/apis");
      const { Configuration } = await import("@/api/web-sdk/runtime");
      // The builder, exactly as executeTransferAction runs it.
      const form = transferExecutorInput({
        action: "update",
        input: { data: { custom: CUSTOM } },
      })!;
      const action = buildInventoryAction(
        "update",
        UNIT,
        bridgeActionInput("update", form),
      );
      // The SDK's own serialization, sent with the face binding.
      const sent: string[] = [];
      const api = new EbusApi(
        new Configuration({
          basePath: "http://localhost/api/backend",
          fetchApi: async (url, init) => {
            sent.push(String(init?.body));
            return wallet(browser, String(url), init ?? {});
          },
        }),
      );
      const prepared = await api.prepareAction(
        { prepareExecuteRequest: { action } },
        async ({ init }) => ({
          headers: { ...(init.headers as Record<string, string>), ...face },
        }),
      );
      expect(prepared.nonce).toBe(3);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toContain('"serialNumber":"SN-REDACTED-0001"');
      expect(sent[0]).toContain('"serial_number":"SN-REDACTED-0001"');
      // Exactly the SDK's bytes reached Dual: nothing stripped, renamed,
      // reordered or re-serialised.
      expect(forwarded()).toEqual([["/ebus/prepare", utf8(sent[0])]]);
      const custom = JSON.parse(sent[0]).action.update.data.custom;
      expect(custom).toEqual(CUSTOM);
      expect(Object.keys(custom)).toEqual(Object.keys(CUSTOM));
      // The same map is executed too.
      const execute = `{"action":${JSON.stringify(JSON.parse(sent[0]).action)},"nonce":3}`;
      expect(
        await route(browser, ["ebus", "execute"], execute, face),
      ).toMatchObject({ status: 200 });
      expect(forwarded()[1]).toEqual(["/ebus/execute", utf8(execute)]);
    },
  );

  const update = (inner: string) =>
    `{"action":{"update":{"id":"${UNIT}",${inner}}}}`;
  const refused: Array<[string, string]> = [
    // Exact duplicates stay refused anywhere, inside the custom map too.
    [
      "an exact duplicate key in custom",
      update(`"data":{"custom":{"serialNumber":"A","serialNumber":"B"}}`),
    ],
    [
      "an escaped exact duplicate in custom (serial\\u004eumber)",
      update(`"data":{"custom":{"serialNumber":"A","serial\\u004eumber":"B"}}`),
    ],
    [
      "an escaped exact duplicate in custom (\\u0073erialNumber)",
      update(`"data":{"custom":{"\\u0073erialNumber":"A","serialNumber":"B"}}`),
    ],
    [
      "two lone surrogates Go reads as one key",
      update(`"data":{"custom":{"\\ud800":"A","\\udc00":"B"}}`),
    ],
    [
      "a duplicate __proto__ in custom",
      update(`"data":{"custom":{"__proto__":{"a":1},"__proto__":{"a":2}}}`),
    ],
    [
      "a duplicate constructor in custom",
      update(`"data":{"custom":{"constructor":1,"constructor":2}}`),
    ],
    // Folded aliases in typed envelope and action fields stay refused.
    [
      "a folded alias of the unit id",
      `{"action":{"update":{"ID":"${"b".repeat(24)}","id":"${UNIT}","data":{"custom":${JSON.stringify(CUSTOM)}}}}}`,
    ],
    [
      "a folded alias of data",
      update(`"Data":{"custom":{}},"data":{"custom":{"serialNumber":"A"}}`),
    ],
    [
      "a folded alias of custom",
      update(`"data":{"Custom":{"a":1},"custom":{"serialNumber":"A"}}`),
    ],
    [
      "a folded alias of update",
      `{"action":{"Update":{"id":"${"b".repeat(24)}"},"update":{"id":"${UNIT}"}}}`,
    ],
    [
      "a folded alias of action",
      `{"Action":{"burn":{"id":"${UNIT}"}},"action":{"update":{"id":"${UNIT}"}}}`,
    ],
    // Deep nesting: only custom's OWN keys are exact.
    [
      "a folded collision nested inside custom",
      update(
        `"data":{"custom":{"dual_asset":{"serialNumber":"A","serial_number":"B"}}}`,
      ),
    ],
    [
      "an exact duplicate deep inside custom",
      update(`"data":{"custom":{"a":{"b":{"c":{"d":{"e":1,"e":2}}}}}}`),
    ],
    // A non-object custom: its objects are not the designated map.
    [
      "a custom array of colliding objects",
      update(`"data":{"custom":[{"serialNumber":"A","serial_number":"B"}]}`),
    ],
    // The same map at a position that is not designated stays folded.
    [
      "custom directly under update",
      update(`"custom":{"serialNumber":"A","serial_number":"B"}`),
    ],
    [
      "metadata beside custom",
      update(`"data":{"metadata":{"serialNumber":"A","serial_number":"B"}}`),
    ],
    [
      "data as an array of custom",
      update(`"data":[{"custom":{"serialNumber":"A","serial_number":"B"}}]`),
    ],
    [
      "a folded spelling of the designated path",
      update(`"Data":{"custom":{"serialNumber":"A","serial_number":"B"}}`),
    ],
    [
      "a top-level custom",
      `{"action":{"update":{"id":"${UNIT}"}},"custom":{"serialNumber":"A","serial_number":"B"}}`,
    ],
  ];

  it.each([
    ["ebus", "prepare"],
    ["ebus", "execute"],
  ])(
    "%s/%s: each ambiguous body is refused, typed and undispatched",
    async (...path) => {
      const { browser, face } = bound(generic);
      for (const [label, raw] of refused) {
        expect(JSON.parse(raw)).toBeTruthy();
        // Refused before any upstream request, with the binding's own typed
        // reason, no session renewal and nothing written to the journal.
        expect([label, await route(browser, path, raw, face)]).toEqual([
          label,
          { status: 400, code: "face_execution_mismatch", cookie: null },
        ]);
      }
      expect(runtime).not.toHaveBeenCalled();
      expect(getWallet).not.toHaveBeenCalled();
    },
  );

  it("distinct prototype-named and differently cased keys in custom are forwarded unchanged", async () => {
    const { browser, face } = bound(generic);
    const raw = update(
      `"data":{"custom":{"__proto__":{"x":1},"constructor":"c","Constructor":"C","serialNumber":"A","serial_number":"B","SERIALNUMBER":"C","deep":{"a":{"b":{"c":{"d":{"e":[1,{"f":2}]}}}}}}}`,
    );
    expect(await route(browser, ["ebus", "prepare"], raw, face)).toMatchObject({
      status: 200,
    });
    expect(forwarded()).toEqual([["/ebus/prepare", utf8(raw)]]);
  });

  it("the parser alone: designated keys exact, every other position folded", async () => {
    const { unambiguousObject, repeatsMemberName } =
      await import("@/api/strict-json-body");
    const bytes = (text: string) => new Uint8Array(utf8(text)).buffer;
    const pair = `{"serialNumber":1,"serial_number":2}`;
    expect(
      unambiguousObject(
        bytes(`{"action":{"update":{"data":{"custom":${pair}}}}}`),
      ),
    ).toBeDefined();
    for (const position of [
      `{"action":{"mint":{"data":{"custom":${pair}}}}}`,
      `{"action":{"update":{"data":{"custom":{"x":${pair}}}}}}`,
      `{"action":{"update":{"data":{"custom":[${pair}]}}}}`,
      `{"action":[{"update":{"data":{"custom":${pair}}}}]}`,
      `{"x":{"action":{"update":{"data":{"custom":${pair}}}}}}`,
      `{"action":{"update":{"data":${pair}}}}`,
      `{"action":${pair}}`,
      pair,
    ]) {
      expect([position, repeatsMemberName(position)]).toEqual([position, true]);
    }
    // A sibling object after the designated map is folded again.
    expect(
      repeatsMemberName(
        `{"action":{"update":{"data":{"custom":{"a":1},"z":${pair}}}}}`,
      ),
    ).toBe(true);
  });
});
