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
  CHECKSUM_HOLDER,
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
const LINKED_WARRANTY = {
  purpose: "claims-warranty",
  applicationId: "tig.claims.morrow-warranty",
  origin: "https://warranty.example",
  instanceId: "tig-app-warranty0001",
};
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
  /** The host's launch id for the face frame this browser has open. */
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
        "x-dual-face-launch": this.launchId,
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

// The bound runtime's registrations/status, answering per operation id ("down":
// unreachable). Records every call the host makes to it.
type RuntimeAnswer = { status: number; body: Record<string, unknown> } | "down";
function runtimeRegistrationStatus(answers: Record<string, RuntimeAnswer>) {
  const calls: Array<{
    url: string;
    headers: Headers;
    init: RequestInit;
    body: Record<string, unknown>;
  }> = [];
  const original = global.fetch;
  global.fetch = jest.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, headers: new Headers(init.headers), init, body });
    const answer = answers[body.operationId];
    if (!answer || answer === "down") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(answer.body), { status: answer.status });
  }) as unknown as typeof fetch;
  return {
    calls,
    restore: () => {
      global.fetch = original;
    },
  };
}
// What the Passport runtime answers for an operation it holds no journal for.
const neverRecorded = (operationId: string): RuntimeAnswer => ({
  status: 404,
  body: {
    ok: false,
    status: "not_submitted",
    reason: "face_operation_not_found",
    operationId,
    objectId: null,
  },
});
const runtimeAnswered = (
  operationId: string,
  answer: string,
  httpStatus = 200,
): RuntimeAnswer => ({
  status: httpStatus,
  body: {
    ok: answer === "registered",
    status: answer,
    operationId,
    objectId: UNIT,
  },
});
// REGISTRATION_CLOSE_AFTER_MS: provable 30 minutes after the assertion was issued.
const CLOSE_AFTER_MS = 30 * 60 * 1000;

async function issueRegistration(browser: Browser, operationId: string) {
  await confirmRegistration(browser, operationId);
  const minted = await mint(browser, {
    operation: "registration.submit",
    operation_id: operationId,
    target: { object_id: UNIT },
    request_hash: REQUEST_HASH,
  });
  expect(minted.status).toBe(200);
  return minted;
}

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

  it("an EIP-55 mixed-case Dual account: assertions carry the canonical lowercase holder, and the face still binds the same wallet", async () => {
    const base = await getWallet();
    getWallet.mockResolvedValue({
      ...base,
      account: { ...base.account, address: CHECKSUM_HOLDER },
    });
    const lowercase = CHECKSUM_HOLDER.toLowerCase();
    const browser = new Browser();
    const operationId = "register-op-0090";
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
    expect(claims).toMatchObject({ holder: lowercase, sub: "wallet-1" });
    // Ownership stays case-insensitive: a unit Dual reports in either case is this wallet's.
    for (const owner of [lowercase, CHECKSUM_HOLDER]) {
      getObjectByIdPublic.mockResolvedValue(smartObject(UNIT, owner));
      expect(
        await operations(browser, {
          transition: "begin",
          kind: "registration",
          operation: "registration.submit",
          operation_id: `register-op-009${owner === lowercase ? 1 : 2}`,
          object_id: UNIT,
          record_id: "rec-0001",
          request_hash: REQUEST_HASH,
        }),
      ).toMatchObject({
        status: 409,
        body: { code: "already_registered_to_you" },
      });
      getObjectById.mockResolvedValue(smartObject(UNIT, owner));
      const selected = await select(browser, UNIT);
      expect(selected.status).toBe(200);
      const read = await mint(browser, {
        operation: "products.private.read",
        operation_id: `read-op-009${owner === lowercase ? 1 : 2}`,
        target: { object_id: UNIT },
        request_hash: `sha256:${"1".repeat(64)}`,
        context_id: selected.body.context_id,
      });
      expect(read.status).toBe(200);
      expect(
        JSON.parse(
          Buffer.from(
            read.body.assertion.split(".")[1],
            "base64url",
          ).toString(),
        ).holder,
      ).toBe(lowercase);
    }
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
    // Owner equality with a pending transfer is NOT registered; and the
    // unit's state is this operation's only when the runtime journalled it.
    getObjectByIdPublic.mockResolvedValue(
      smartObject(UNIT, HOLDER, {
        state: "Transfer pending",
        lifecycle: { target_state: "Registered" },
      }),
    );
    const pending = runtimeRegistrationStatus({
      [operationId]: runtimeAnswered(
        operationId,
        "ownership_moved_state_pending",
      ),
    });
    try {
      expect((await status(browser, operationId)).body).toMatchObject({
        status: "ownership_moved_state_pending",
        readback: { owner_is_you: true, state: "Transfer pending" },
      });
    } finally {
      pending.restore();
    }
    const unrecorded = runtimeRegistrationStatus({
      [operationId]: neverRecorded(operationId),
    });
    try {
      expect((await status(browser, operationId)).body).toMatchObject({
        status: "outcome_unknown",
        readback: { owner_is_you: true, state: "Transfer pending" },
      });
    } finally {
      unrecorded.restore();
    }
    getObjectByIdPublic.mockResolvedValue(
      smartObject(UNIT, HOLDER, { state: "Registered" }),
    );
    // The readback names the unit, not the operation: registered (and
    // settled) only when the runtime says THIS operation registered.
    const unreachable = runtimeRegistrationStatus({ [operationId]: "down" });
    try {
      expect((await status(browser, operationId)).body).toMatchObject({
        status: "outcome_unknown",
        phase: "assertion_issued",
      });
    } finally {
      unreachable.restore();
    }
    const runtime = runtimeRegistrationStatus({
      [operationId]: runtimeAnswered(operationId, "registered"),
    });
    try {
      expect((await status(browser, operationId)).body).toMatchObject({
        status: "registered",
      });
      expect(runtime.calls).toHaveLength(1);
      // Settled: answered from the journal, the runtime is not asked again.
      expect((await status(browser, operationId)).body).toMatchObject({
        status: "registered",
        phase: "settled",
      });
      expect(runtime.calls).toHaveLength(1);
    } finally {
      runtime.restore();
    }
  });

  it("closes a registration the runtime refused before recording it (401) only once it provably never ran, and keeps it", async () => {
    // The hosted case: Dual names the account in EIP-55 mixed case; the
    // runtime refused the face's POST /registrations with 401
    // face_assertion_claims_invalid before it recorded anything.
    const account = await getWallet();
    getWallet.mockResolvedValue({
      ...account,
      account: { ...account.account, address: CHECKSUM_HOLDER },
    });
    const browser = new Browser();
    const operationId = "reg-bae6ab93779af98103c0";
    const issuedAt = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(issuedAt);
    const runtime = runtimeRegistrationStatus({
      [operationId]: neverRecorded(operationId),
    });
    try {
      await issueRegistration(browser, operationId);
      getObjectByIdPublic.mockResolvedValue(smartObject(UNIT, "0xissuer"));
      // Check status before it is provable: unknown, and the runtime is not
      // asked (nothing to attribute, nothing to close yet).
      for (const at of [5 * 60 * 1000, CLOSE_AFTER_MS - 1000]) {
        clock.mockReturnValue(issuedAt + at);
        expect((await status(browser, operationId)).body).toMatchObject({
          status: "outcome_unknown",
          phase: "assertion_issued",
        });
      }
      expect(runtime.calls).toHaveLength(0);
      // Provable: one read-only status read for exactly this operation, and
      // the runtime holds no journal for it, so it never ran and never can.
      clock.mockReturnValue(issuedAt + CLOSE_AFTER_MS + 1000);
      expect((await status(browser, operationId)).body).toMatchObject({
        operation_id: operationId,
        kind: "registration",
        status: "not_submitted",
        phase: "settled",
      });
      expect(runtime.calls).toHaveLength(1);
      const [call] = runtime.calls;
      expect(call.url).toBe(
        "https://faces.example/api/product-face/v1/registrations/status",
      );
      expect(call.headers.get("x-tig-product-face-application")).toBe(
        "tig.passport.morrow-home",
      );
      expect(call.headers.get("origin")).toBeNull();
      expect(call.headers.get("cookie")).toBeNull();
      expect(call.init.credentials).toBe("omit");
      expect(Object.keys(call.body).sort()).toEqual([
        "assertion",
        "operationId",
      ]);
      const claims = JSON.parse(
        Buffer.from(
          String(call.body.assertion).split(".")[1],
          "base64url",
        ).toString("utf8"),
      );
      expect(claims).toMatchObject({
        operation: "registration.status",
        op_id: operationId,
        target: { object_id: UNIT },
        holder: CHECKSUM_HOLDER.toLowerCase(),
        request_hash: `sha256:${createHash("sha256")
          .update(JSON.stringify({ operationId }))
          .digest("hex")}`,
      });
      // Kept, closed with its reason (the sealed journal holds the closure).
      const listed = await browser.call(
        operationsGET,
        `/api/faces/${SLUG}/operations`,
        slugParams,
      );
      expect(listed.body.operations).toEqual([
        expect.objectContaining({
          operation_id: operationId,
          phase: "settled",
          status: "not_submitted",
        }),
      ]);
      // The unit later registered to this wallet by a NEW operation: the
      // closed one still never ran, and the runtime is not asked again.
      getObjectByIdPublic.mockResolvedValue(
        smartObject(UNIT, CHECKSUM_HOLDER, { state: "Registered" }),
      );
      expect((await status(browser, operationId)).body).toMatchObject({
        status: "not_submitted",
        phase: "settled",
      });
      expect(runtime.calls).toHaveLength(1);
      // Never minted for submission again; the face's own status read still is.
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
      expect(
        (
          await mint(browser, {
            operation: "registration.status",
            operation_id: operationId,
            target: { object_id: UNIT },
            request_hash: `sha256:${"e".repeat(64)}`,
          })
        ).status,
      ).toBe(200);
    } finally {
      runtime.restore();
      clock.mockRestore();
    }
  });

  it("never attributes a later registration of the same unit to an earlier open operation", async () => {
    const browser = new Browser();
    const earlier = "register-op-0201";
    const later = "register-op-0202";
    const issuedAt = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(issuedAt);
    const runtime = runtimeRegistrationStatus({
      [earlier]: neverRecorded(earlier),
      [later]: runtimeAnswered(later, "registered"),
    });
    try {
      await issueRegistration(browser, earlier);
      clock.mockReturnValue(issuedAt + 60 * 1000);
      await issueRegistration(browser, later);
      // The later operation moved the unit to this wallet, state pending:
      // that is not the earlier operation's state either.
      getObjectByIdPublic.mockResolvedValue(
        smartObject(UNIT, HOLDER, { state: "Transfer pending" }),
      );
      expect((await status(browser, earlier)).body).toMatchObject({
        status: "outcome_unknown",
        phase: "assertion_issued",
      });
      // The later operation registered the unit to this wallet.
      getObjectByIdPublic.mockResolvedValue(
        smartObject(UNIT, HOLDER, { state: "Registered" }),
      );
      clock.mockReturnValue(issuedAt + 2 * 60 * 1000);
      expect((await status(browser, later)).body).toMatchObject({
        status: "registered",
      });
      // The earlier one is not that registration: unknown until provable.
      expect((await status(browser, earlier)).body).toMatchObject({
        status: "outcome_unknown",
        phase: "assertion_issued",
      });
      clock.mockReturnValue(issuedAt + CLOSE_AFTER_MS + 1000);
      expect((await status(browser, earlier)).body).toMatchObject({
        status: "not_submitted",
        phase: "settled",
      });
      expect((await status(browser, later)).body).toMatchObject({
        status: "registered",
        phase: "settled",
      });
      expect(runtime.calls.map((call) => call.body.operationId)).toEqual([
        earlier,
        later,
        earlier,
        earlier,
      ]);
    } finally {
      runtime.restore();
      clock.mockRestore();
    }
  });

  it("closes nothing on any other runtime answer past the point it could run", async () => {
    const issuedAt = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(issuedAt);
    const id = (index: number) =>
      `register-op-03${String(index).padStart(2, "0")}`;
    const answers: RuntimeAnswer[] = [
      "down",
      {
        status: 503,
        body: {
          status: "refused",
          reason: "face_runtime_unprovisioned",
          operationId: id(1),
        },
      },
      // The runtime holds a journal for it: whatever it says, it was accepted.
      runtimeAnswered(id(2), "outcome_unknown", 202),
      runtimeAnswered(id(3), "refused", 200),
      // Not found, but not the journal (another reason or another operation).
      {
        status: 404,
        body: {
          status: "not_submitted",
          reason: "face_record_not_found",
          operationId: id(4),
        },
      },
      {
        status: 404,
        body: {
          status: "not_submitted",
          reason: "face_operation_not_found",
          operationId: "register-op-9999",
        },
      },
      {
        status: 403,
        body: {
          status: "refused",
          reason: "face_operation_not_yours",
          operationId: id(6),
        },
      },
    ];
    const runtime = runtimeRegistrationStatus(
      Object.fromEntries(answers.map((answer, index) => [id(index), answer])),
    );
    try {
      for (let index = 0; index < answers.length; index += 1) {
        const browser = new Browser();
        clock.mockReturnValue(issuedAt);
        await issueRegistration(browser, id(index));
        getObjectByIdPublic.mockResolvedValue(smartObject(UNIT, "0xissuer"));
        clock.mockReturnValue(issuedAt + CLOSE_AFTER_MS + 60 * 1000);
        expect((await status(browser, id(index))).body).toMatchObject({
          status: "outcome_unknown",
          phase: "assertion_issued",
        });
      }
      expect(runtime.calls).toHaveLength(answers.length);
    } finally {
      runtime.restore();
      clock.mockRestore();
    }
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

  it("caps outstanding unexpired assertions per launch", async () => {
    const browser = new Browser();
    getObjectById.mockResolvedValue(smartObject(UNIT, HOLDER));
    const { body } = await select(browser, UNIT);
    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      const result = await mint(browser, {
        operation: "products.private.read",
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
    // contract r10: case operations belong to the linked Warranty runtime.
    process.env.PRODUCT_FACE_APPLICATIONS = JSON.stringify([
      bindingInput({ linkedRuntimes: [LINKED_WARRANTY] }),
    ]);
    const browser = new Browser();
    getObjectById.mockResolvedValue(smartObject(UNIT, HOLDER));
    const { body } = await select(browser, UNIT);
    const original = global.fetch;
    const runtimeCalls: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      // The linked runtime's fixed endpoint and routing header, no browser
      // Origin or cookies.
      expect(url).toBe(
        "https://warranty.example/api/product-face/v1/operations",
      );
      const headers = new Headers(init.headers);
      expect(headers.get("x-tig-product-face-application")).toBe(
        "tig.claims.morrow-warranty",
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
      const approved = await approve("149.90");
      expect(approved.status).toBe(200);
      // r10: the Warranty runtime is the audience; the artifact is the face's.
      const claims = JSON.parse(
        Buffer.from(
          approved.body.assertion.split(".")[1],
          "base64url",
        ).toString("utf8"),
      );
      expect(claims).toMatchObject({
        aud: "tig.claims.morrow-warranty@https://warranty.example",
        app_id: "tig.passport.morrow-home",
        artifact: `sha256:${ARTIFACT_HEX}`,
        origin: "https://faces.example",
        operation: "case.quote.approve",
      });
      const readClaims = JSON.parse(
        Buffer.from(
          String(runtimeCalls[0].assertion).split(".")[1],
          "base64url",
        ).toString("utf8"),
      );
      expect(readClaims.aud).toBe(
        "tig.claims.morrow-warranty@https://warranty.example",
      );
      // The runtime was read once; no payment endpoint exists or was called.
      expect(runtimeCalls).toHaveLength(1);
    } finally {
      global.fetch = original;
    }
  });

  it("mints case operations only for a linked Warranty runtime; others keep the face audience", async () => {
    const browser = new Browser();
    getObjectById.mockResolvedValue(smartObject(UNIT, HOLDER));
    const { body } = await select(browser, UNIT);
    const request = (operation: string) =>
      mint(browser, {
        operation,
        operation_id: "read-op-0001",
        target:
          operation === "case.read"
            ? { object_id: UNIT, case_id: "case-1" }
            : { object_id: UNIT },
        request_hash: `sha256:${"4".repeat(64)}`,
        context_id: body.context_id,
      });
    expect(await request("case.read")).toMatchObject({
      status: 409,
      body: { code: "case_runtime_not_linked" },
    });
    const own = await request("products.private.read");
    expect(own.status).toBe(200);
    expect(
      JSON.parse(
        Buffer.from(own.body.assertion.split(".")[1], "base64url").toString(
          "utf8",
        ),
      ).aud,
    ).toBe("tig.passport.morrow-home@https://faces.example");
  });

  it("obtains and validates the settle proposal itself", async () => {
    getObjectById.mockResolvedValue(
      smartObject(UNIT, HOLDER, { state: "Transfer pending" }),
    );
    const proposalInput = {
      custom: {
        recordId: "rec-0001",
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
          '{"action":"update","input":{"custom":{"lifecycle":{"target_state":"Authenticity verified"},"recordId":"rec-0001","state":"Authenticity verified"}},"object_id":"' +
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
      // G6b: no proposal right now, and why; the reason reaches the host as
      // the runtime stated it (a refusal is never reported as a quote change).
      for (const reason of [
        "issuer_preauthorisation_absent",
        "issuer_preauthorisation_expired",
        "issuer_auto_proposal_used",
      ]) {
        global.fetch = jest.fn(
          async () =>
            new Response(
              JSON.stringify({
                ok: false,
                status: "settle_proposal_unavailable",
                reason,
                nextStep: "brand_operator_proposal",
              }),
              { status: 409 },
            ),
        ) as unknown as typeof fetch;
        expect(await request()).toMatchObject({
          status: 409,
          body: { code: "settle_proposal_unavailable", reason },
        });
      }
      // An unknown reason is not passed on.
      global.fetch = jest.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: false,
              status: "settle_proposal_unavailable",
              reason: "something_else",
            }),
            { status: 409 },
          ),
      ) as unknown as typeof fetch;
      const unknownReason = await request();
      expect(unknownReason).toMatchObject({
        status: 409,
        body: { code: "settle_proposal_unavailable" },
      });
      expect(unknownReason.body).not.toHaveProperty("reason");
      global.fetch = jest.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: false,
              status: "face_settle_proposal_required",
            }),
            { status: 409 },
          ),
      ) as unknown as typeof fetch;
      expect(await request()).toMatchObject({
        status: 409,
        body: { code: "proposal_rejected" },
      });
      global.fetch = jest.fn(
        async () =>
          new Response(
            JSON.stringify({ ok: false, status: "settle_not_required" }),
            { status: 409 },
          ),
      ) as unknown as typeof fetch;
      expect(await request()).toMatchObject({
        status: 409,
        body: { code: "settle_not_required" },
      });
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
    const journalCookie = `dual_face_launch_${browser.launchId}`;
    expect(browser.cookies.has(journalCookie)).toBe(true);
    const logout = await browser.call(
      (request: NextRequest) => logoutPOST(request),
      "/api/session/logout",
      {},
      {},
    );
    expect(logout.status).toBe(200);
    expect(browser.cookies.has(journalCookie)).toBe(false);
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
