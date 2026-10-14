/**
 * @jest-environment node
 */
import { createHash, generateKeyPairSync } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ResponseError } from "@/api/web-sdk/runtime";
import { DEFAULT_ORGANIZATION_ID } from "@/api/tenant";
import {
  ARTIFACT_HEX,
  bindingInput,
  HOLDER,
  TEMPLATE_A,
} from "@/test/product-face-fixtures";

const getWallet = jest.fn();
const getObjectById = jest.fn();
const getObjectByIdPublic = jest.fn();
jest.mock("@/api/web-sdk-client", () => ({
  getWalletsApi: () => ({ getWallet, logout: jest.fn() }),
  getObjectsApi: () => ({ getObjectById, getObjectByIdPublic }),
}));

import { establishSession } from "@/api/server-session";
import { resetIssueGuard } from "@/api/product-face-operations";
import { resetFaceArtifactCache } from "@/api/face-artifact";
import { GET as contextGET } from "@/app/api/faces/[slug]/context/route";
import { POST as selectionPOST } from "@/app/api/faces/[slug]/selection/route";
import {
  GET as operationsGET,
  POST as operationsPOST,
} from "@/app/api/faces/[slug]/operations/route";
import { GET as statusGET } from "@/app/api/faces/[slug]/operations/[operationId]/route";
import { POST as assertionsPOST } from "@/app/api/faces/[slug]/assertions/route";
import { POST as proposalPOST } from "@/app/api/faces/[slug]/settle-proposal/route";
import { POST as logoutPOST } from "@/app/api/session/logout/route";
import type { LoginOut } from "@/api/web-sdk/models/LoginOut";

const UNIT = "aaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER = "bbbbbbbbbbbbbbbbbbbbbbbb";
const SLUG = "morrow-home";
// r6: the face's hash over its entire exact runtime registrations body.
const REQUEST_HASH = `sha256:${"d".repeat(64)}`;
const keys = generateKeyPairSync("ed25519");

function jwt(claims: Record<string, unknown>) {
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
}

function smartObject(
  id: string,
  owner: string,
  custom: Record<string, unknown> = { state: "Registered" },
  templateId = TEMPLATE_A,
) {
  return {
    id,
    templateId,
    owner,
    custom: { recordId: "rec-0001", ...custom },
    metadata: { name: `Arc grinder ${id.slice(0, 4)}` },
    whenModified: new Date("2026-10-01T00:00:00Z"),
  };
}

class Browser {
  cookies = new Map<string, string>();

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
    const jar = (response as NextResponse).cookies;
    for (const cookie of jar.getAll()) {
      if (cookie.value) this.cookies.set(cookie.name, cookie.value);
      else this.cookies.delete(cookie.name);
    }
    return response;
  }

  request(path: string, body?: unknown) {
    return new NextRequest(`http://localhost${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        host: "localhost",
        origin: "http://localhost",
        cookie: Array.from(this.cookies, ([k, v]) => `${k}=${v}`).join("; "),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
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
    const response = this.take(
      await handler(this.request(path, body), {
        params: Promise.resolve(params),
      }),
    );
    return { status: response.status, body: await response.json() };
  }
}

const slugParams = { slug: SLUG };
const operations = (browser: Browser, body: unknown) =>
  browser.call(
    operationsPOST,
    `/api/faces/${SLUG}/operations`,
    slugParams,
    body,
  );
const mint = (browser: Browser, body: unknown) =>
  browser.call(
    assertionsPOST,
    `/api/faces/${SLUG}/assertions`,
    slugParams,
    body,
  );
const select = (browser: Browser, objectId: string | null) =>
  browser.call(selectionPOST, `/api/faces/${SLUG}/selection`, slugParams, {
    object_id: objectId,
  });
const status = (browser: Browser, operationId: string) =>
  browser.call(statusGET, `/api/faces/${SLUG}/operations/${operationId}`, {
    slug: SLUG,
    operationId,
  });

async function confirmRegistration(browser: Browser, operationId: string) {
  getObjectByIdPublic.mockResolvedValue(smartObject(UNIT, "0xissuer"));
  expect(
    (
      await operations(browser, {
        transition: "begin",
        kind: "registration",
        operation: "registration.submit",
        operation_id: operationId,
        object_id: UNIT,
        record_id: "rec-0001",
        request_hash: REQUEST_HASH,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await operations(browser, {
        transition: "confirm",
        operation_id: operationId,
      })
    ).status,
  ).toBe(200);
}

beforeEach(() => {
  process.env.PRODUCT_FACE_APPLICATIONS = JSON.stringify([bindingInput()]);
  process.env.FACE_ASSERTION_KEY_ID = "wallet-face-test";
  process.env.FACE_ASSERTION_SIGNING_KEY = keys.privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString();
  resetIssueGuard();
  resetFaceArtifactCache();
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
});

afterEach(() => {
  delete process.env.PRODUCT_FACE_APPLICATIONS;
  delete process.env.FACE_ASSERTION_KEY_ID;
  delete process.env.FACE_ASSERTION_SIGNING_KEY;
});

describe("product face BFF", () => {
  it("knows no application for an unknown slug", async () => {
    const browser = new Browser();
    const result = await browser.call(
      contextGET,
      "/api/faces/unknown/context",
      { slug: "unknown" },
    );
    expect(result).toEqual({
      status: 404,
      body: expect.objectContaining({ code: "unknown_application" }),
    });
    expect(
      (
        await browser.call(
          assertionsPOST,
          "/api/faces/unknown/assertions",
          { slug: "unknown" },
          {},
        )
      ).status,
    ).toBe(404);
  });

  it("refuses to open a frame when the pinned artifact does not verify", async () => {
    const original = global.fetch;
    global.fetch = jest.fn(
      async () => new Response("{}", { status: 200 }),
    ) as unknown as typeof fetch;
    try {
      const result = await new Browser().call(
        contextGET,
        `/api/faces/${SLUG}/context`,
        slugParams,
      );
      expect(result).toEqual({
        status: 409,
        body: expect.objectContaining({ code: "artifact_mismatch" }),
      });
      expect(result.body).not.toHaveProperty("frameUrl");
    } finally {
      global.fetch = original;
    }
  });

  it("mints registration.submit only after a confirmed journal entry, once", async () => {
    const browser = new Browser();
    const operationId = "register-op-0001";
    expect(
      await mint(browser, {
        operation: "registration.submit",
        operation_id: operationId,
        target: { object_id: UNIT },
        request_hash: REQUEST_HASH,
      }),
    ).toMatchObject({ status: 404, body: { code: "unknown_operation" } });

    await confirmRegistration(browser, operationId);
    const minted = await mint(browser, {
      operation: "registration.submit",
      operation_id: operationId,
      target: { object_id: UNIT },
      request_hash: REQUEST_HASH,
    });
    expect(minted.status).toBe(200);
    const claims = JSON.parse(
      Buffer.from(minted.body.assertion.split(".")[1], "base64url").toString(),
    );
    expect(claims).toMatchObject({
      holder: HOLDER,
      sub: "wallet-1",
      operation: "registration.submit",
      op_id: operationId,
      target: { object_id: UNIT },
      artifact: `sha256:${ARTIFACT_HEX}`,
      iss: "http://localhost",
      // Carried unchanged from the face; the runtime recomputes it.
      request_hash: REQUEST_HASH,
    });

    // The journal now records the issued assertion; no second mint.
    expect(
      await mint(browser, {
        operation: "registration.submit",
        operation_id: operationId,
        target: { object_id: UNIT },
        request_hash: REQUEST_HASH,
      }),
    ).toMatchObject({
      status: 409,
      body: { code: "operation_already_submitted" },
    });
    const listed = await browser.call(
      operationsGET,
      `/api/faces/${SLUG}/operations`,
      slugParams,
    );
    expect(listed.body.operations).toEqual([
      expect.objectContaining({
        operation_id: operationId,
        phase: "assertion_issued",
      }),
    ]);
    expect(JSON.stringify(listed.body)).not.toContain(minted.body.assertion);
  });

  it("binds registration to the projection's record and the face's request hash", async () => {
    const browser = new Browser();
    getObjectByIdPublic.mockResolvedValue(smartObject(UNIT, "0xissuer"));
    const begin = (extra: Record<string, unknown>) =>
      operations(browser, {
        transition: "begin",
        kind: "registration",
        operation: "registration.submit",
        operation_id: "register-op-0050",
        object_id: UNIT,
        ...extra,
      });
    expect(await begin({ request_hash: REQUEST_HASH })).toMatchObject({
      status: 400,
      body: { code: "invalid_request" },
    });
    expect(await begin({ record_id: "rec-0001" })).toMatchObject({
      status: 400,
      body: { code: "invalid_request" },
    });
    expect(
      await begin({ record_id: "rec-9999", request_hash: REQUEST_HASH }),
    ).toMatchObject({ status: 409, body: { code: "record_mismatch" } });

    await confirmRegistration(browser, "register-op-0051");
    // A hash other than the confirmed one, or none, mints nothing.
    for (const requestHash of [`sha256:${"f".repeat(64)}`, undefined]) {
      expect(
        (
          await mint(browser, {
            operation: "registration.submit",
            operation_id: "register-op-0051",
            target: { object_id: UNIT },
            ...(requestHash ? { request_hash: requestHash } : {}),
          })
        ).status,
      ).toBeGreaterThanOrEqual(400);
    }
    const minted = await mint(browser, {
      operation: "registration.submit",
      operation_id: "register-op-0051",
      target: { object_id: UNIT },
      request_hash: REQUEST_HASH,
    });
    expect(minted.status).toBe(200);
    expect(
      JSON.parse(
        Buffer.from(
          minted.body.assertion.split(".")[1],
          "base64url",
        ).toString(),
      ).request_hash,
    ).toBe(REQUEST_HASH);
  });

  it("never accepts a holder, wallet or subject from the browser", async () => {
    const browser = new Browser();
    await confirmRegistration(browser, "register-op-0002");
    for (const extra of [
      { holder: "0xattacker" },
      { sub: "w" },
      { wallet: "w" },
    ]) {
      expect(
        await mint(browser, {
          operation: "registration.submit",
          operation_id: "register-op-0002",
          target: { object_id: UNIT },
          request_hash: REQUEST_HASH,
          ...extra,
        }),
      ).toMatchObject({ status: 400, body: { code: "invalid_request" } });
    }
  });

  it("fails closed with 503 when unprovisioned and issues nothing", async () => {
    const browser = new Browser();
    await confirmRegistration(browser, "register-op-0003");
    delete process.env.FACE_ASSERTION_SIGNING_KEY;
    expect(
      await mint(browser, {
        operation: "registration.submit",
        operation_id: "register-op-0003",
        target: { object_id: UNIT },
        request_hash: REQUEST_HASH,
      }),
    ).toMatchObject({
      status: 503,
      body: { code: "face_assertion_unprovisioned" },
    });
    const listed = await browser.call(
      operationsGET,
      `/api/faces/${SLUG}/operations`,
      slugParams,
    );
    expect(listed.body.operations[0]).toMatchObject({ phase: "confirmed" });
  });

  it("refuses registration for another programme or an already held unit", async () => {
    const browser = new Browser();
    const begin = (operationId: string) =>
      operations(browser, {
        transition: "begin",
        kind: "registration",
        operation: "registration.submit",
        operation_id: operationId,
        object_id: UNIT,
        record_id: "rec-0001",
        request_hash: REQUEST_HASH,
      });
    getObjectByIdPublic.mockResolvedValue(
      smartObject(UNIT, "0xissuer", {}, "000000000000000000000000"),
    );
    expect(await begin("register-op-0010")).toMatchObject({
      status: 404,
      body: { code: "not_in_programme" },
    });
    getObjectByIdPublic.mockResolvedValue(smartObject(UNIT, HOLDER));
    expect(await begin("register-op-0011")).toMatchObject({
      status: 409,
      body: { code: "already_registered_to_you" },
    });
    getObjectByIdPublic.mockResolvedValue(
      smartObject(UNIT, HOLDER, { state: "Transfer pending" }),
    );
    expect(await begin("register-op-0012")).toMatchObject({
      status: 409,
      body: { code: "ownership_moved_state_pending" },
    });
  });

  it("reconciles status read-only from the journal and canonical readback", async () => {
    const browser = new Browser();
    const operationId = "register-op-0020";
    await confirmRegistration(browser, operationId);
    await mint(browser, {
      operation: "registration.submit",
      operation_id: operationId,
      target: { object_id: UNIT },
      request_hash: REQUEST_HASH,
    });
    getObjectByIdPublic.mockResolvedValue(smartObject(UNIT, "0xissuer"));
    expect((await status(browser, operationId)).body).toMatchObject({
      status: "outcome_unknown",
      readback: { owner_is_you: false },
    });
    // Owner equality with a pending transfer is NOT registered.
    getObjectByIdPublic.mockResolvedValue(
      smartObject(UNIT, HOLDER, {
        state: "Transfer pending",
        lifecycle: { target_state: "Registered" },
      }),
    );
    expect((await status(browser, operationId)).body).toMatchObject({
      status: "ownership_moved_state_pending",
      readback: { owner_is_you: true, state: "Transfer pending" },
    });
    getObjectByIdPublic.mockResolvedValue(
      smartObject(UNIT, HOLDER, { state: "Registered" }),
    );
    expect((await status(browser, operationId)).body).toMatchObject({
      status: "registered",
    });
  });

  it("mints product-scoped reads only for the current server-side selection", async () => {
    const browser = new Browser();
    getObjectById.mockImplementation(async ({ objectId }) =>
      smartObject(objectId, HOLDER),
    );
    const read = (contextId: string | undefined, objectId: string) =>
      mint(browser, {
        operation: "products.private.read",
        operation_id: "read-op-0001",
        target: { object_id: objectId },
        request_hash: `sha256:${"1".repeat(64)}`,
        ...(contextId ? { context_id: contextId } : {}),
      });
    expect(await read(undefined, UNIT)).toMatchObject({
      status: 409,
      body: { code: "stale_context" },
    });
    const first = await select(browser, UNIT);
    expect(first.status).toBe(200);
    expect((await read(first.body.context_id, UNIT)).status).toBe(200);
    const second = await select(browser, OTHER);
    expect(second.body.context_id).not.toBe(first.body.context_id);
    // After a product switch nothing is minted for the old context.
    expect(await read(first.body.context_id, UNIT)).toMatchObject({
      status: 409,
      body: { code: "stale_context" },
    });
    getObjectById.mockResolvedValue(smartObject(UNIT, "0xsomeoneelse"));
    expect(await select(browser, UNIT)).toMatchObject({
      status: 403,
      body: { code: "not_owned" },
    });
  });

  it("caps outstanding unexpired assertions per session", async () => {
    const browser = new Browser();
    getObjectById.mockResolvedValue(smartObject(UNIT, HOLDER));
    const { body } = await select(browser, UNIT);
    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      const result = await mint(browser, {
        operation: "cases.list",
        operation_id: `read-op-${String(index).padStart(4, "0")}`,
        target: { object_id: UNIT },
        request_hash: `sha256:${"2".repeat(64)}`,
        context_id: body.context_id,
      });
      statuses.push(result.status);
    }
    expect(statuses).toEqual([...Array(10).fill(200), 429]);
  });

  it("binds quote decisions to the quote the wallet read itself", async () => {
    const browser = new Browser();
    getObjectById.mockResolvedValue(smartObject(UNIT, HOLDER));
    const { body } = await select(browser, UNIT);
    const original = global.fetch;
    const runtimeCalls: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      // Fixed endpoint, routing header, no browser Origin or cookies.
      expect(url).toBe("https://faces.example/api/product-face/v1/operations");
      const headers = new Headers(init.headers);
      expect(headers.get("x-tig-product-face-application")).toBe(
        "tig.passport.morrow-home",
      );
      expect(headers.get("origin")).toBeNull();
      expect(headers.get("cookie")).toBeNull();
      expect(init.credentials).toBe("omit");
      runtimeCalls.push(JSON.parse(String(init.body)));
      return new Response(
        JSON.stringify({
          case: {
            case_id: "case-1",
            quote: {
              quote_version: "q2",
              provider: "Morrow Service Centre",
              amount: "149.90",
              currency: "EUR",
            },
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    try {
      const begun = await operations(browser, {
        transition: "begin",
        kind: "runtime",
        operation: "case.quote.approve",
        operation_id: "quote-op-0001",
        object_id: UNIT,
        case_id: "case-1",
        context_id: body.context_id,
      });
      expect(begun.body.quote).toEqual({
        case_id: "case-1",
        quote_version: "q2",
        provider: "Morrow Service Centre",
        amount: "149.90",
        currency: "EUR",
      });
      expect(runtimeCalls).toEqual([
        expect.objectContaining({
          operation: "case.read",
          target: { object_id: UNIT, case_id: "case-1" },
        }),
      ]);
      await operations(browser, {
        transition: "confirm",
        operation_id: "quote-op-0001",
        context_id: body.context_id,
      });
      const approve = (amount: string) =>
        mint(browser, {
          operation: "case.quote.approve",
          operation_id: "quote-op-0001",
          target: {
            object_id: UNIT,
            case_id: "case-1",
            quote_version: "q2",
            amount,
            currency: "EUR",
          },
          request_hash: `sha256:${"3".repeat(64)}`,
          context_id: body.context_id,
        });
      expect(await approve("99.00")).toMatchObject({
        status: 409,
        body: { code: "quote_changed" },
      });
      expect((await approve("149.90")).status).toBe(200);
      // The runtime was read once; no payment endpoint exists or was called.
      expect(runtimeCalls).toHaveLength(1);
    } finally {
      global.fetch = original;
    }
  });

  it("obtains and validates the settle proposal itself", async () => {
    getObjectById.mockResolvedValue(
      smartObject(UNIT, HOLDER, { state: "Transfer pending" }),
    );
    const proposalInput = {
      custom: {
        state: "Authenticity verified",
        lifecycle: { target_state: "Authenticity verified" },
      },
    };
    const canonical = (input: unknown, objectId = UNIT) =>
      JSON.stringify({ action: "update", input, object_id: objectId });
    const respond = (proposal: Record<string, unknown>) => {
      global.fetch = jest.fn(
        async () => new Response(JSON.stringify({ proposal }), { status: 200 }),
      ) as unknown as typeof fetch;
    };
    const good = {
      proposal_id: "proposal-1",
      operation_id: "register-op-0030",
      object_id: UNIT,
      action: "update",
      input: proposalInput,
      proposal_hash: `sha256:${createHash("sha256")
        .update(
          '{"action":"update","input":{"custom":{"lifecycle":{"target_state":"Authenticity verified"},"state":"Authenticity verified"}},"object_id":"' +
            UNIT +
            '"}',
        )
        .digest("hex")}`,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    expect(canonical(proposalInput)).toContain("Authenticity verified");
    const original = global.fetch;
    const request = async () => {
      const browser = new Browser();
      const { body } = await select(browser, UNIT);
      return browser.call(
        proposalPOST,
        `/api/faces/${SLUG}/settle-proposal`,
        slugParams,
        {
          context_id: body.context_id,
          operation_id: "register-op-0030",
          object_id: UNIT,
        },
      );
    };
    try {
      respond(good);
      expect(await request()).toMatchObject({
        status: 200,
        body: { proposal: { proposal_id: "proposal-1", object_id: UNIT } },
      });
      for (const bad of [
        { ...good, proposal_hash: `sha256:${"0".repeat(64)}` },
        { ...good, object_id: OTHER },
        { ...good, operation_id: "register-op-9999" },
        { ...good, expires_at: new Date(Date.now() - 1000).toISOString() },
        { ...good, action: "claim_ownership" },
        {
          ...good,
          input: { custom: { ...proposalInput.custom, owner: "0xattacker" } },
        },
        {
          ...good,
          input: { custom: { ...proposalInput.custom, state: "Registered" } },
        },
      ]) {
        respond(bad);
        expect(await request()).toMatchObject({
          status: 422,
          body: { code: "proposal_rejected" },
        });
      }
      getObjectById.mockResolvedValue(
        smartObject(UNIT, HOLDER, { state: "Registered" }),
      );
      respond(good);
      expect(await request()).toMatchObject({
        status: 409,
        body: { code: "settle_not_required" },
      });
    } finally {
      global.fetch = original;
    }
  });

  it("clears the session and journal on a terminal 401 and on logout", async () => {
    const browser = new Browser();
    await confirmRegistration(browser, "register-op-0040");
    expect(browser.cookies.has("dual_face_journal")).toBe(true);
    const logout = await browser.call(
      (request: NextRequest) => logoutPOST(request),
      "/api/session/logout",
      {},
      {},
    );
    expect(logout.status).toBe(200);
    expect(browser.cookies.has("dual_face_journal")).toBe(false);
    expect(browser.cookies.has("smarttoken_viewer")).toBe(false);

    const expired = new Browser();
    getWallet.mockRejectedValue(
      new ResponseError(new Response(null, { status: 401 })),
    );
    const result = await expired.call(
      operationsGET,
      `/api/faces/${SLUG}/operations`,
      slugParams,
    );
    expect(result.status).toBe(401);
    expect(expired.cookies.has("smarttoken_viewer")).toBe(false);
  });
});
