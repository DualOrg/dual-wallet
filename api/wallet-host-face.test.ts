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

import { establishSession } from "@/api/server-session";
import { resetIssueGuard } from "@/api/product-face-operations";
import { resetWalletHostCache } from "@/api/wallet-host";
import type { LoginOut } from "@/api/web-sdk/models/LoginOut";
import { POST as acceptOfferPOST } from "@/app/api/faces/[slug]/accept-offer/route";
import { POST as assertionsPOST } from "@/app/api/faces/[slug]/assertions/route";
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

  constructor() {
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

  async call<P>(
    handler: (
      request: NextRequest,
      context: { params: Promise<P> },
    ) => Promise<Response>,
    path: string,
    params: P,
    body?: unknown,
  ) {
    const request = new NextRequest(`http://localhost${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        host: "localhost",
        origin: "http://localhost",
        cookie: Array.from(this.cookies, ([k, v]) => `${k}=${v}`).join("; "),
        "x-dual-face-launch": this.launchId,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
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
