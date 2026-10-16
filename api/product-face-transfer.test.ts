/**
 * @jest-environment node
 */
// G8 (contract r16 transfer.sign), the holder's host side through the real
// BFF routes: the wallet reads the next transfer step itself from the bound
// runtime (server to server) and accepts it only for the selected owned unit
// and the runtime-bound recipient; a confirmed step is reserved before any
// execution and "won" only on this request's own dispatch:"won" with
// executionPermitted; a cancel that won the runtime's offer decision is
// transfer_cancelled; anything else is outcome_unknown and never re-reserved;
// afterwards only verify or the read-only status is called.
import { createHash, generateKeyPairSync } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_ORGANIZATION_ID } from "@/api/tenant";
import type { LoginOut } from "@/api/web-sdk/models/LoginOut";
import {
  bindingInput,
  edit,
  HOLDER,
  REMOVE,
  TEMPLATE_A,
} from "@/test/product-face-fixtures";

const getWallet = jest.fn();
const refreshToken = jest.fn();
const getObjectById = jest.fn();
const getObjectByIdPublic = jest.fn();
jest.mock("@/api/web-sdk-client", () => ({
  getWalletsApi: () => ({ getWallet, refreshToken, logout: jest.fn() }),
  getObjectsApi: () => ({ getObjectById, getObjectByIdPublic }),
}));

const UNIT = "aaaaaaaaaaaaaaaaaaaaaaaa";
const SLUG = "morrow-home";
const OFFER = "pto-0123456789abcdef01234567";
const PROPOSAL = "ptp-0123456789abcdef01234567";
const STEP_OP = "xfer-0123456789abcdef";
const RECIPIENT = "0x00000000000000000000000000000000000000b2";
const keys = generateKeyPairSync("ed25519");

type Handler = (
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) => Promise<Response>;

type BackendHandler = (
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) => Promise<Response>;

type StatusHandler = (
  request: NextRequest,
  context: { params: Promise<{ slug: string; operationId: string }> },
) => Promise<Response>;

type ListHandler = (
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) => Promise<Response>;

interface Instance {
  selection: Handler;
  operations: Handler;
  list: ListHandler;
  proposal: Handler;
  progress: Handler;
  status: StatusHandler;
  backend: BackendHandler;
  establishSession: typeof import("@/api/server-session").establishSession;
  /** This instance's own SDK error class (its own module registry). */
  ResponseError: typeof import("@/api/web-sdk/runtime").ResponseError;
  unsealForPurpose: typeof import("@/api/server-session").unsealForPurpose;
}

/** One independently loaded BFF: its own module registry and process state. */
function loadInstance(): Instance {
  let instance: Instance | undefined;
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const session = require("@/api/server-session");
    instance = {
      selection: require("@/app/api/faces/[slug]/selection/route").POST,
      operations: require("@/app/api/faces/[slug]/operations/route").POST,
      list: require("@/app/api/faces/[slug]/operations/route").GET,
      proposal: require("@/app/api/faces/[slug]/transfer-proposal/route").POST,
      progress: require("@/app/api/faces/[slug]/transfer-progress/route").POST,
      status: require("@/app/api/faces/[slug]/operations/[operationId]/route")
        .GET,
      backend: require("@/app/api/backend/[...path]/route").POST,
      establishSession: session.establishSession,
      ResponseError: require("@/api/web-sdk/runtime").ResponseError,
      unsealForPurpose: session.unsealForPurpose,
    };
    /* eslint-enable @typescript-eslint/no-require-imports */
  });
  return instance!;
}

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

class Browser {
  cookies = new Map<string, string>();
  constructor(
    instance: Instance,
    readonly launchId = `launch-${"q".repeat(28)}`,
  ) {
    const response = NextResponse.json({});
    instance.establishSession(
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
  }

  /** A copy of this browser's cookies, as a second tab or replay would send. */
  snapshot() {
    return new Map(this.cookies);
  }

  async call(
    handler: Handler,
    path: string,
    body: unknown,
    cookies = this.cookies,
    keep = true,
  ) {
    const response = await handler(
      new NextRequest(`http://localhost${path}`, {
        method: "POST",
        headers: {
          host: "localhost",
          origin: "http://localhost",
          "content-type": "application/json",
          "x-dual-face-launch": this.launchId,
          cookie: Array.from(cookies, ([k, v]) => `${k}=${v}`).join("; "),
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ slug: SLUG }) },
    );
    if (keep) this.take(response);
    return { status: response.status, body: await response.json() };
  }

  /**
   * As a browser does it: the request carries this jar's cookies, and the
   * response's raw Set-Cookie headers are applied back to the jar (a value
   * sets the cookie; an empty value, Max-Age=0 or a past Expires deletes it).
   * A cookie the response does not name stays exactly as it was. Returns the
   * raw headers too.
   */
  async post(handler: Handler, path: string, body: unknown) {
    const response = await handler(
      new NextRequest(`http://localhost${path}`, {
        method: "POST",
        headers: {
          host: "localhost",
          origin: "http://localhost",
          "content-type": "application/json",
          "x-dual-face-launch": this.launchId,
          cookie: Array.from(this.cookies, ([k, v]) => `${k}=${v}`).join("; "),
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ slug: SLUG }) },
    );
    const setCookie = response.headers.getSetCookie();
    for (const header of setCookie) {
      const [pair, ...attributes] = header.split(";");
      const at = pair.indexOf("=");
      const name = pair.slice(0, at).trim();
      const value = pair.slice(at + 1).trim();
      const expired = attributes.some((attribute) => {
        const [key, raw = ""] = attribute.trim().split("=");
        return (
          (key.toLowerCase() === "max-age" && Number(raw) <= 0) ||
          (key.toLowerCase() === "expires" && Date.parse(raw) <= Date.now())
        );
      });
      if (!value || expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return {
      status: response.status,
      body: await response.json(),
      setCookie,
    };
  }

  /** The wallet's own /api/backend proxy, as its executor calls it. */
  async backend(
    instance: Instance,
    path: string[],
    body: unknown,
    {
      face,
      cookies = this.cookies,
      keep = false,
    }: {
      face?: Record<string, string>;
      cookies?: Map<string, string>;
      keep?: boolean;
    } = {},
  ) {
    const response = await instance.backend(
      new NextRequest(`http://localhost/api/backend/${path.join("/")}`, {
        method: "POST",
        headers: {
          host: "localhost",
          origin: "http://localhost",
          "content-type": "application/json",
          ...face,
          cookie: Array.from(cookies, ([k, v]) => `${k}=${v}`).join("; "),
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ path }) },
    );
    if (keep) this.take(response);
    return {
      status: response.status,
      body: (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null,
    };
  }

  /** The read-only status route for one operation. */
  async status(instance: Instance, operationId: string) {
    const response = await instance.status(
      new NextRequest(
        `http://localhost/api/faces/${SLUG}/operations/${operationId}`,
        {
          headers: {
            host: "localhost",
            "x-dual-face-launch": this.launchId,
            cookie: Array.from(this.cookies, ([k, v]) => `${k}=${v}`).join(
              "; ",
            ),
          },
        },
      ),
      { params: Promise.resolve({ slug: SLUG, operationId }) },
    );
    this.take(response);
    return { status: response.status, body: await response.json() };
  }
}

type Step = "request" | "transfer";

/**
 * LOCAL FAKE of the runtime's G8 host operations: transfer.propose answers the
 * next step for the bound recipient; transfer.reserve creates ONE reservation
 * per step ("won" only for that call) unless the offer was cancelled first;
 * verify/status commit a step only when the test reports the holder's action,
 * each answering for the step that operation reserved. With `advance`, once a
 * request step's action is found the offer's next step is its custody step.
 */
function fakeTransferRuntime({
  step: firstStep = "request" as Step,
  propose = undefined as
    undefined | ((body: Record<string, unknown>) => Record<string, unknown>),
  cancelled = false,
  loseReserve = false,
  advance = false,
} = {}) {
  const calls: Array<{
    origin: string | null;
    operation: string;
    claims: Record<string, unknown>;
    body: Record<string, unknown>;
  }> = [];
  const reservations = new Map<string, string>();
  const executed = new Set<string>();
  /** The step each reserved step operation is. */
  const stepOf = new Map<string, Step>();
  const current = (): Step =>
    advance &&
    [...executed].some((operationId) => stepOf.get(operationId) === "request")
      ? "transfer"
      : firstStep;
  const stepAnswer = (objectId: string) => {
    const step = current();
    // As the Studio runtime builds it (contract r17): a deep copy of its own
    // fresh read of the unit with only the governed leaves written.
    const input =
      step === "transfer"
        ? { to: RECIPIENT }
        : {
            data: {
              custom: {
                ...JSON.parse(JSON.stringify(OWNED_CUSTOM)),
                state: "Transfer pending",
                lifecycle: { target_state: "Transfer pending" },
                proof_event: {
                  public_fields: [
                    `recipientReferenceHash:${sha256(RECIPIENT)}`,
                  ],
                },
              },
            },
          };
    const action = step === "transfer" ? "transfer" : "update";
    return {
      ok: true,
      status: "transfer_step_proposed",
      step,
      proposal_id: PROPOSAL,
      offer_id: OFFER,
      object_id: objectId,
      action,
      input,
      proposal_hash: sha256(canonical({ object_id: objectId, action, input })),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      recipient: RECIPIENT,
    };
  };
  const json = (status: number, value: unknown) =>
    new Response(JSON.stringify(value), { status });
  const fetchImpl = jest.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const headers = new Headers(init.headers);
    const claims = JSON.parse(
      Buffer.from(String(body.assertion).split(".")[1], "base64url").toString(
        "utf8",
      ),
    ) as Record<string, unknown>;
    const operation = String(body.operation);
    calls.push({ origin: headers.get("origin"), operation, claims, body });
    const { assertion: _assertion, ...rest } = body;
    void _assertion;
    if (
      claims.operation !== operation ||
      claims.op_id !== body.operationId ||
      claims.request_hash !== sha256(canonical(rest)) ||
      claims.holder !== HOLDER.toLowerCase()
    ) {
      return json(403, { ok: false, status: "face_assertion_mismatch" });
    }
    const target = body.target as { object_id: string };
    const input = body.input as Record<string, string>;
    if (operation === "transfer.propose") {
      return json(
        200,
        propose
          ? propose(stepAnswer(target.object_id))
          : stepAnswer(target.object_id),
      );
    }
    if (operation === "transfer.reserve") {
      if (cancelled) {
        return json(409, {
          ok: false,
          status: "transfer_offer_cancelled",
          reason: "transfer_offer_cancelled",
          dispatch: "refused",
          executionPermitted: false,
        });
      }
      const step = current();
      const key = `${input.offer_id}:${step}`;
      if (reservations.has(key)) {
        return json(409, {
          ok: false,
          status: "already_claimed",
          dispatch: "already_claimed",
          executionPermitted: false,
        });
      }
      reservations.set(key, String(body.operationId));
      stepOf.set(String(body.operationId), step);
      if (loseReserve) throw new TypeError("connection reset after reserve");
      return json(200, {
        ok: true,
        status: "granted",
        dispatch: "won",
        executionPermitted: true,
        reservation: {
          step,
          state: "granted",
          step_operation_id: body.operationId,
          proposal_id: input.proposal_id,
        },
      });
    }
    if (operation === "transfer.verify" || operation === "transfer.status") {
      if (!executed.has(input.step_operation_id)) {
        return json(202, {
          ok: false,
          status: "outcome_unknown",
          reason: "transfer_action_not_found",
        });
      }
      const step = stepOf.get(input.step_operation_id) ?? firstStep;
      return json(200, {
        ok: true,
        status:
          step === "transfer" ? "transferred" : "transfer_request_committed",
        step,
      });
    }
    return json(400, { ok: false, status: "face_request_invalid" });
  });
  return {
    fetchImpl,
    calls,
    reservations,
    /** The holder's wallet executed the step (the test's host, on won only). */
    executed: (stepOperationId: string) => executed.add(stepOperationId),
  };
}

/** A tampered request step, re-hashed so only the template can refuse it. */
function tamper(change: (custom: Record<string, unknown>) => void) {
  return (answer: Record<string, unknown>) => {
    const input = JSON.parse(JSON.stringify(answer.input));
    change(input.data.custom);
    return {
      ...answer,
      input,
      proposal_hash: sha256(
        canonical({
          object_id: answer.object_id,
          action: answer.action,
          input,
        }),
      ),
    };
  };
}

async function selected(instance: Instance, browser: Browser) {
  const result = await browser.call(
    instance.selection,
    `/api/faces/${SLUG}/selection`,
    { object_id: UNIT },
  );
  expect(result.status).toBe(200);
  return result.body.context_id as string;
}

async function confirmedStep(
  instance: Instance,
  browser: Browser,
  contextId: string,
  operation = "transfer.request",
) {
  const path = `/api/faces/${SLUG}/operations`;
  const begin = await browser.call(instance.operations, path, {
    transition: "begin",
    kind: "transfer",
    operation,
    operation_id: STEP_OP,
    object_id: UNIT,
    context_id: contextId,
    proposal_id: PROPOSAL,
    offer_id: OFFER,
  });
  expect(begin.status).toBe(200);
  expect(
    (
      await browser.call(instance.operations, path, {
        transition: "confirm",
        operation_id: STEP_OP,
        context_id: contextId,
      })
    ).status,
  ).toBe(200);
  return () =>
    browser.call(instance.operations, path, {
      transition: "submit",
      operation_id: STEP_OP,
      context_id: contextId,
    });
}

// A Studio-minted unit: activation_hash and dual_asset are mint provenance.
const OWNED_CUSTOM = {
  recordId: "rec-0001",
  state: "Authenticity verified",
  activation_hash: "b".repeat(64),
  dual_asset: { title: "Arc grinder", rights: ["hold"] },
};
// binding.transferRequest as the runtime's template inspection answers it.
const TRANSFER_REQUEST = {
  action: "update",
  inputPath: "data.custom",
  leaves: {
    recordId: { unchanged: true },
    state: { enum: ["Transfer pending"] },
    "lifecycle.target_state": { enum: ["Transfer pending"] },
    "proof_event.public_fields": { runtimeIssued: "public_fields" },
  },
  fromStates: ["Authenticity verified"],
  targetStates: ["Transfer pending"],
  preserveUnlisted: true,
};
const ownedUnit = (custom: Record<string, unknown> = OWNED_CUSTOM) => ({
  id: UNIT,
  templateId: TEMPLATE_A,
  owner: HOLDER,
  custom: JSON.parse(JSON.stringify(custom)),
  metadata: { name: "Arc grinder" },
  whenModified: new Date("2026-10-01T00:00:00Z"),
});

const original = global.fetch;
beforeEach(() => {
  process.env.PRODUCT_FACE_APPLICATIONS = JSON.stringify([
    bindingInput({ transferRequest: TRANSFER_REQUEST }),
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
  const owned = ownedUnit();
  getObjectById.mockReset().mockResolvedValue(owned);
  getObjectByIdPublic.mockReset().mockResolvedValue(owned);
});
afterEach(() => {
  global.fetch = original;
  delete process.env.PRODUCT_FACE_APPLICATIONS;
  delete process.env.FACE_ASSERTION_KEY_ID;
  delete process.env.FACE_ASSERTION_SIGNING_KEY;
});

describe("G8 transfer step, the holder's host (contract r16 transfer.sign)", () => {
  it("reads the next step itself, server to server, with the runtime-bound recipient", async () => {
    const runtime = fakeTransferRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const instance = loadInstance();
    const browser = new Browser(instance);
    const contextId = await selected(instance, browser);
    const read = await browser.call(
      instance.proposal,
      `/api/faces/${SLUG}/transfer-proposal`,
      { context_id: contextId, offer_id: OFFER, object_id: UNIT },
    );
    expect(read.status).toBe(200);
    expect(read.body.proposal).toMatchObject({
      step: "request",
      offer_id: OFFER,
      object_id: UNIT,
      action: "update",
      recipient: RECIPIENT,
    });
    expect(runtime.calls).toHaveLength(1);
    expect(runtime.calls[0]).toMatchObject({
      origin: null,
      operation: "transfer.propose",
      body: { target: { object_id: UNIT }, input: { offer_id: OFFER } },
    });
    // A face cannot supply a recipient or anything else.
    const extra = await browser.call(
      instance.proposal,
      `/api/faces/${SLUG}/transfer-proposal`,
      {
        context_id: contextId,
        offer_id: OFFER,
        object_id: UNIT,
        recipient: "0x00000000000000000000000000000000000000ff",
      },
    );
    expect(extra).toMatchObject({
      status: 400,
      body: { code: "invalid_request" },
    });
  });

  it.each([
    [
      "a request naming another recipient in its proof event",
      (answer: Record<string, unknown>) => ({
        ...answer,
        recipient: "0x00000000000000000000000000000000000000cc",
      }),
    ],
    [
      "the holder's own wallet as the recipient",
      (answer: Record<string, unknown>) => ({
        ...answer,
        recipient: HOLDER.toLowerCase(),
      }),
    ],
    [
      "a hash that is not the proposal's",
      (answer: Record<string, unknown>) => ({
        ...answer,
        proposal_hash: `sha256:${"9".repeat(64)}`,
      }),
    ],
    [
      "another unit",
      (answer: Record<string, unknown>) => ({
        ...answer,
        object_id: "bbbbbbbbbbbbbbbbbbbbbbbb",
      }),
    ],
    // Re-hashed, so only the exact template refuses them (contract r17).
    [
      "a request rewriting the record id",
      tamper((c) => edit(c, "recordId", "rec-9999")),
    ],
    ["a request adding a leaf", tamper((c) => edit(c, "extra", "added"))],
    [
      "a request adding a nested leaf",
      tamper((c) => edit(c, "dual_asset.extra", "added")),
    ],
    [
      "a request changing a mint key",
      tamper((c) => edit(c, "activation_hash", "c".repeat(64))),
    ],
    [
      "a request changing a nested mint key",
      tamper((c) => edit(c, "dual_asset.rights", ["burn"])),
    ],
    [
      "a request dropping a mint key",
      tamper((c) => edit(c, "activation_hash", REMOVE)),
    ],
    [
      "a request writing another state",
      tamper((c) => {
        edit(c, "state", "In service");
        edit(c, "lifecycle.target_state", "In service");
      }),
    ],
  ])("refuses %s", async (_label, propose) => {
    const runtime = fakeTransferRuntime({ propose });
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const instance = loadInstance();
    const browser = new Browser(instance);
    const contextId = await selected(instance, browser);
    const read = await browser.call(
      instance.proposal,
      `/api/faces/${SLUG}/transfer-proposal`,
      { context_id: contextId, offer_id: OFFER, object_id: UNIT },
    );
    expect(read).toMatchObject({
      status: 422,
      body: { code: "proposal_rejected" },
    });
    // Nothing was journalled or reserved: only the read reached the runtime.
    expect(runtime.calls.map((call) => call.operation)).toEqual([
      "transfer.propose",
    ]);
  });

  it("without binding.transferRequest: capability_not_granted, nothing reaches the runtime or the journal", async () => {
    process.env.PRODUCT_FACE_APPLICATIONS = JSON.stringify([bindingInput()]);
    const runtime = fakeTransferRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const instance = loadInstance();
    const browser = new Browser(instance);
    const contextId = await selected(instance, browser);
    expect(
      await browser.call(
        instance.proposal,
        `/api/faces/${SLUG}/transfer-proposal`,
        { context_id: contextId, offer_id: OFFER, object_id: UNIT },
      ),
    ).toMatchObject({ status: 403, body: { code: "capability_not_granted" } });
    expect(
      await browser.call(instance.operations, `/api/faces/${SLUG}/operations`, {
        transition: "begin",
        kind: "transfer",
        operation: "transfer.request",
        operation_id: STEP_OP,
        object_id: UNIT,
        context_id: contextId,
        proposal_id: PROPOSAL,
        offer_id: OFFER,
      }),
    ).toMatchObject({ status: 403, body: { code: "capability_not_granted" } });
    expect(runtime.calls).toHaveLength(0);
    // A template without the complete-map flag is refused too (fail closed).
    process.env.PRODUCT_FACE_APPLICATIONS = JSON.stringify([
      bindingInput({
        transferRequest: { ...TRANSFER_REQUEST, preserveUnlisted: undefined },
      }),
    ]);
    const older = loadInstance();
    const second = new Browser(older);
    const secondContext = await selected(older, second);
    expect(
      await second.call(
        older.proposal,
        `/api/faces/${SLUG}/transfer-proposal`,
        { context_id: secondContext, offer_id: OFFER, object_id: UNIT },
      ),
    ).toMatchObject({ status: 422, body: { code: "proposal_rejected" } });
  });

  it("a unit that changed between begin and submit is refused before the reserve (r7 + r17)", async () => {
    const runtime = fakeTransferRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const instance = loadInstance();
    const browser = new Browser(instance);
    const contextId = await selected(instance, browser);
    const submit = await confirmedStep(instance, browser, contextId);
    // The unit gains a key (or a mint value moves) after the proposal was checked.
    getObjectById.mockResolvedValue(
      ownedUnit({ ...OWNED_CUSTOM, warrantyNote: "keep" }),
    );
    expect(await submit()).toMatchObject({
      status: 409,
      body: { code: "proposal_rejected" },
    });
    getObjectById.mockResolvedValue(
      ownedUnit({ ...OWNED_CUSTOM, activation_hash: "c".repeat(64) }),
    );
    expect(await submit()).toMatchObject({
      status: 409,
      body: { code: "proposal_rejected" },
    });
    expect(runtime.calls).toHaveLength(0);
    // Unchanged again: the same entry submits and reserves once.
    getObjectById.mockResolvedValue(ownedUnit());
    expect((await submit()).body.reservation).toBe("won");
  });

  it("reserves before any execution: won once; a replay is outcome_unknown and nothing is reserved again", async () => {
    const runtime = fakeTransferRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const instance = loadInstance();
    const browser = new Browser(instance);
    const contextId = await selected(instance, browser);
    const submit = await confirmedStep(instance, browser, contextId);
    const stale = browser.snapshot();
    const won = await submit();
    expect(won).toMatchObject({ status: 200, body: { reservation: "won" } });
    expect(runtime.calls.at(-1)).toMatchObject({
      origin: null,
      operation: "transfer.reserve",
      body: {
        operationId: STEP_OP,
        input: { offer_id: OFFER, proposal_id: PROPOSAL },
      },
    });
    // A replay from an older cookie (another server) reaches the runtime and
    // is already_claimed: never "won" again.
    const replay = await browser.call(
      loadInstance().operations,
      `/api/faces/${SLUG}/operations`,
      { transition: "submit", operation_id: STEP_OP, context_id: contextId },
      stale,
      false,
    );
    expect(replay).toMatchObject({
      status: 409,
      body: { code: "outcome_unknown" },
    });
    // The same launch never reserves again.
    const again = await submit();
    expect(again).toMatchObject({
      status: 409,
      body: { code: "operation_already_submitted" },
    });
    expect(
      runtime.calls.filter((call) => call.operation === "transfer.reserve"),
    ).toHaveLength(2);
  });

  it("a cancel that won the runtime's offer decision is transfer_cancelled; a lost reserve answer is outcome_unknown", async () => {
    for (const [options, code] of [
      [{ cancelled: true }, "transfer_cancelled"],
      [{ loseReserve: true }, "outcome_unknown"],
    ] as const) {
      const runtime = fakeTransferRuntime(options);
      global.fetch = runtime.fetchImpl as unknown as typeof fetch;
      const instance = loadInstance();
      const browser = new Browser(instance);
      const contextId = await selected(instance, browser);
      const submit = await confirmedStep(instance, browser, contextId);
      expect(await submit()).toMatchObject({ status: 409, body: { code } });
    }
  });

  it("after a won step: status reads unknown until the holder's action is found, then verifies and settles; never reserves again", async () => {
    const runtime = fakeTransferRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const instance = loadInstance();
    const browser = new Browser(instance);
    const contextId = await selected(instance, browser);
    const submit = await confirmedStep(instance, browser, contextId);
    expect((await submit()).body.reservation).toBe("won");
    const progress = () =>
      browser.call(instance.progress, `/api/faces/${SLUG}/transfer-progress`, {
        operation_id: STEP_OP,
      });
    expect(await progress()).toMatchObject({
      status: 200,
      body: { status: "outcome_unknown", step: "request" },
    });
    expect(runtime.calls.at(-1)?.operation).toBe("transfer.status");
    // The holder's action, recorded in the journal, is verified.
    runtime.executed(STEP_OP);
    expect(
      (
        await browser.call(
          instance.operations,
          `/api/faces/${SLUG}/operations`,
          {
            transition: "record_action",
            operation_id: STEP_OP,
            action_id: "action-transfer-1",
          },
        )
      ).status,
    ).toBe(200);
    expect(await progress()).toMatchObject({
      status: 200,
      body: { status: "transfer_request_committed", step: "request" },
    });
    expect(runtime.calls.at(-1)).toMatchObject({
      operation: "transfer.verify",
      body: {
        input: {
          offer_id: OFFER,
          action_id: "action-transfer-1",
          step_operation_id: STEP_OP,
        },
      },
    });
    // Settled: answered from the journal, no further runtime call.
    const calls = runtime.calls.length;
    expect((await progress()).body.status).toBe("transfer_request_committed");
    expect(runtime.calls).toHaveLength(calls);
    expect(
      runtime.calls.filter((call) => call.operation === "transfer.reserve"),
    ).toHaveLength(1);
  });

  // Hosted acceptance: the holder's step was sent (custody moved, so the
  // sender no longer sees the object), the holder signed out and in again and
  // the face relaunched. Its progress must still be read, from this wallet's
  // own sealed history, never answered unknown_operation (which the face
  // treats as "nothing was sent"). Real sealed launch journals, two sessions.
  it("after a sign-out, a new sign-in and a new launch, a submitted step's progress is read from this wallet's own sealed history, read-only; another wallet reads nothing", async () => {
    const runtime = fakeTransferRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const instance = loadInstance();
    const browser = new Browser(instance);
    const contextId = await selected(instance, browser);
    const submit = await confirmedStep(instance, browser, contextId);
    expect((await submit()).body.reservation).toBe("won");
    // The holder's action, recorded under the launch and session that won it.
    expect(
      (
        await browser.call(
          instance.operations,
          `/api/faces/${SLUG}/operations`,
          {
            transition: "record_action",
            operation_id: STEP_OP,
            action_id: "action-transfer-1",
          },
        )
      ).status,
    ).toBe(200);
    const oldLaunch = [...browser.cookies].filter(([name]) =>
      name.startsWith("dual_face_launch_"),
    );
    expect(oldLaunch).toHaveLength(1);
    const [[oldName, oldSealed]] = oldLaunch;
    // Signed out and in again, the face relaunched: a new session cookie and
    // a new launch; the old launch's sealed journal is still in the browser.
    const relaunched = new Browser(instance, `launch-${"r".repeat(28)}`);
    const cookies = new Map([...relaunched.cookies, ...oldLaunch]);
    const path = `/api/faces/${SLUG}/transfer-progress`;
    const progress = () =>
      relaunched.call(
        instance.progress,
        path,
        { operation_id: STEP_OP },
        cookies,
        false,
      );
    const reserves = () =>
      runtime.calls.filter((call) => call.operation === "transfer.reserve")
        .length;
    const reserved = reserves();
    // Not yet seen executed by the runtime: unknown, never unknown_operation.
    expect(await progress()).toMatchObject({
      status: 200,
      body: { status: "outcome_unknown", step: "request" },
    });
    expect(runtime.calls.at(-1)).toMatchObject({
      operation: "transfer.verify",
      body: {
        input: {
          offer_id: OFFER,
          action_id: "action-transfer-1",
          step_operation_id: STEP_OP,
        },
      },
    });
    runtime.executed(STEP_OP);
    const answer = await relaunched.call(
      instance.progress,
      path,
      { operation_id: STEP_OP },
      cookies,
      false,
    );
    expect(answer).toMatchObject({
      status: 200,
      body: { status: "transfer_request_committed", step: "request" },
    });
    // Read only: nothing reserved, submitted or executed again; the old
    // launch's sealed journal is untouched; the new launch never holds it.
    expect(reserves()).toBe(reserved);
    expect(cookies.get(oldName)).toBe(oldSealed);
    // The new launch's own journal write (this read minted) keeps the old
    // launch's cookie as it was: the response never names it (not deleted,
    // re-sealed or given a new expiry).
    relaunched.cookies.set(oldName, oldSealed);
    const written = await relaunched.post(instance.progress, path, {
      operation_id: STEP_OP,
    });
    expect(written.status).toBe(200);
    expect(
      written.setCookie.filter((header) => header.startsWith(`${oldName}=`)),
    ).toEqual([]);
    expect(relaunched.cookies.get(oldName)).toBe(oldSealed);
    // Whatever the new launch wrote, without the old launch's journal the step
    // is unknown there: it was never added to the new launch's journal.
    expect(
      await relaunched.call(
        instance.progress,
        path,
        { operation_id: STEP_OP },
        new Map([...relaunched.cookies].filter(([name]) => name !== oldName)),
        false,
      ),
    ).toMatchObject({ status: 404, body: { code: "unknown_operation" } });
    // Another wallet in the same browser reads nothing of it.
    getWallet.mockResolvedValue({
      id: "wallet-2",
      account: {
        address: "0x00000000000000000000000000000000000000d4",
        type: "SMART_WALLET",
        controller: { address: "0xcontroller2" },
        smartAccount: {},
      },
      whenCreated: new Date(),
      whenModified: new Date(),
      emailVerified: true,
    });
    const other = new Browser(instance, `launch-${"s".repeat(28)}`);
    expect(
      await other.call(
        instance.progress,
        path,
        { operation_id: STEP_OP },
        new Map([...other.cookies, ...oldLaunch]),
        false,
      ),
    ).toMatchObject({ status: 404, body: { code: "unknown_operation" } });
  });

  // The review's decisive case. Reading a step another session's launch sent
  // mints (the runtime read), so the response writes the NEW launch's journal;
  // that write must keep the earlier session's launch cookie, the only record
  // of the step, exactly as it was. One browser and its own cookie jar: each
  // read sends the jar and applies the response's real Set-Cookie headers.
  it("reading a step an earlier session's launch sent keeps that launch's cookie byte for byte: two successive reads through the browser's cookie jar both resolve it", async () => {
    const runtime = fakeTransferRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const instance = loadInstance();
    const browser = new Browser(instance);
    const contextId = await selected(instance, browser);
    const submit = await confirmedStep(instance, browser, contextId);
    expect((await submit()).body.reservation).toBe("won");
    expect(
      (
        await browser.call(
          instance.operations,
          `/api/faces/${SLUG}/operations`,
          {
            transition: "record_action",
            operation_id: STEP_OP,
            action_id: "action-transfer-1",
          },
        )
      ).status,
    ).toBe(200);
    const [[oldName, oldSealed], ...more] = [...browser.cookies].filter(
      ([name]) => name.startsWith("dual_face_launch_"),
    );
    expect(more).toEqual([]);
    // The session expired, the holder signed in again and the face relaunched:
    // the same browser now holds a new session and still the old launch.
    const relaunched = new Browser(instance, `launch-${"w".repeat(28)}`);
    relaunched.cookies.set(oldName, oldSealed);
    const newName = `dual_face_launch_${relaunched.launchId}`;
    const reserves = () =>
      runtime.calls.filter((call) => call.operation === "transfer.reserve")
        .length;
    const reserved = reserves();
    const read = () =>
      relaunched.post(
        instance.progress,
        `/api/faces/${SLUG}/transfer-progress`,
        {
          operation_id: STEP_OP,
        },
      );
    const named = (setCookie: string[], name: string) =>
      setCookie.filter((header) => header.startsWith(`${name}=`));

    const first = await read();
    expect(first).toMatchObject({
      status: 200,
      body: { status: "outcome_unknown", step: "request" },
    });
    // The read minted, so the new launch's journal was written ...
    expect(named(first.setCookie, newName)).toHaveLength(1);
    expect(relaunched.cookies.has(newName)).toBe(true);
    // ... and the old launch's cookie was not named at all: not deleted,
    // re-sealed or given a new expiry; the jar holds it byte for byte.
    expect(named(first.setCookie, oldName)).toEqual([]);
    expect(relaunched.cookies.get(oldName)).toBe(oldSealed);

    // The runtime finds the holder's action; the second read, with whatever
    // the first response left in the jar, still resolves the original step.
    runtime.executed(STEP_OP);
    const second = await read();
    expect(second).toMatchObject({
      status: 200,
      body: { status: "transfer_request_committed", step: "request" },
    });
    expect(runtime.calls.at(-1)).toMatchObject({
      operation: "transfer.verify",
      body: {
        input: {
          offer_id: OFFER,
          action_id: "action-transfer-1",
          step_operation_id: STEP_OP,
        },
      },
    });
    expect(named(second.setCookie, oldName)).toEqual([]);
    expect(relaunched.cookies.get(oldName)).toBe(oldSealed);
    // Read only: nothing reserved again.
    expect(reserves()).toBe(reserved);
  });

  // Root's next user journey: the sender signs in again and the pinned face
  // relaunches. The face keeps step ids in memory only, so it has a NEW step
  // id; the moved object reads 404 for the sender, so the sender can neither
  // list nor select it. The ORIGINAL step is found from this wallet's own
  // sealed history (the host's launch listing, and the sign request's own
  // offer) and read only: verified with its recorded action, never signed,
  // reserved or rebound. Real sealed launch journals and two sessions. (The
  // object reads 404 only once custody moved: the sent step is the custody
  // step.)
  it("after a sign-in and a relaunch with a NEW step id for the same offer and the moved object's 404, the original sent step is found and read only; nothing is signed, reserved or rebound", async () => {
    const runtime = fakeTransferRuntime({ step: "transfer" });
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const instance = loadInstance();
    const browser = new Browser(instance);
    const contextId = await selected(instance, browser);
    const submit = await confirmedStep(
      instance,
      browser,
      contextId,
      "transfer.transfer",
    );
    expect((await submit()).body.reservation).toBe("won");
    expect(
      (
        await browser.call(
          instance.operations,
          `/api/faces/${SLUG}/operations`,
          {
            transition: "record_action",
            operation_id: STEP_OP,
            action_id: "action-transfer-1",
          },
        )
      ).status,
    ).toBe(200);
    const oldLaunch = [...browser.cookies].filter(([name]) =>
      name.startsWith("dual_face_launch_"),
    );
    const [[oldName, oldSealed]] = oldLaunch;
    // Custody moved: the sender's object read is 404.
    getObjectById.mockRejectedValue(
      new instance.ResponseError(
        new Response(null, { status: 404 }),
        "not found",
      ),
    );
    // Signed in again; the face relaunched (a new session and a new launch).
    const relaunched = new Browser(instance, `launch-${"t".repeat(28)}`);
    const cookies = new Map([...relaunched.cookies, ...oldLaunch]);
    // The sender cannot select the moved product any more.
    expect(
      (
        await relaunched.call(
          instance.selection,
          `/api/faces/${SLUG}/selection`,
          { object_id: UNIT },
          cookies,
          false,
        )
      ).status,
    ).toBe(404);
    // The host's launch listing names the ORIGINAL step, read-only.
    const listed = await instance.list(
      new NextRequest(`http://localhost/api/faces/${SLUG}/operations`, {
        method: "GET",
        headers: {
          host: "localhost",
          "x-dual-face-launch": relaunched.launchId,
          cookie: Array.from(cookies, ([k, v]) => `${k}=${v}`).join("; "),
        },
      }),
      { params: Promise.resolve({ slug: SLUG }) },
    );
    const body = await listed.json();
    expect(body.operations).toEqual([]);
    expect(body.retained).toMatchObject([
      {
        operation_id: STEP_OP,
        kind: "transfer",
        operation: "transfer.transfer",
        phase: "submitted",
        object_id: UNIT,
        action_id: "action-transfer-1",
      },
    ]);
    // The face's NEW step id with the same offer: the original step is read.
    const NEW_STEP = "xfer-fedcba9876543210";
    const reserves = () =>
      runtime.calls.filter((call) => call.operation === "transfer.reserve")
        .length;
    const reserved = reserves();
    const progress = (extra: Record<string, unknown> = { offer_id: OFFER }) =>
      relaunched.call(
        instance.progress,
        `/api/faces/${SLUG}/transfer-progress`,
        { operation_id: NEW_STEP, ...extra },
        cookies,
        false,
      );
    expect(await progress()).toMatchObject({
      status: 200,
      body: { status: "outcome_unknown", step: "transfer" },
    });
    expect(runtime.calls.at(-1)).toMatchObject({
      operation: "transfer.verify",
      body: {
        input: {
          offer_id: OFFER,
          action_id: "action-transfer-1",
          step_operation_id: STEP_OP,
        },
      },
    });
    // Only the runtime's committed answer (its exact action, signer,
    // recipient and proof) reports it done; never the 404 alone.
    runtime.executed(STEP_OP);
    expect(await progress()).toMatchObject({
      status: 200,
      body: { status: "transferred", step: "transfer" },
    });
    // Without the offer, a new id is still unknown (never guessed).
    expect(await progress({})).toMatchObject({
      status: 404,
      body: { code: "unknown_operation" },
    });
    // Another offer's sign request finds nothing of it.
    expect(
      await progress({ offer_id: "pto-ffffffffffffffffffffffff" }),
    ).toMatchObject({ status: 404, body: { code: "unknown_operation" } });
    // Read only: nothing reserved again, the old launch untouched, and the
    // new launch holds neither id.
    expect(reserves()).toBe(reserved);
    expect(cookies.get(oldName)).toBe(oldSealed);
    await relaunched.call(
      instance.progress,
      `/api/faces/${SLUG}/transfer-progress`,
      { operation_id: NEW_STEP, offer_id: OFFER },
      cookies,
      true,
    );
    for (const id of [STEP_OP, NEW_STEP]) {
      expect(
        await relaunched.call(
          instance.progress,
          `/api/faces/${SLUG}/transfer-progress`,
          { operation_id: id },
          relaunched.cookies,
          false,
        ),
      ).toMatchObject({ status: 404, body: { code: "unknown_operation" } });
    }
    // Another wallet in the same browser: nothing listed, nothing read.
    getWallet.mockResolvedValue({
      id: "wallet-2",
      account: {
        address: "0x00000000000000000000000000000000000000d4",
        type: "SMART_WALLET",
        controller: { address: "0xcontroller2" },
        smartAccount: {},
      },
      whenCreated: new Date(),
      whenModified: new Date(),
      emailVerified: true,
    });
    const other = new Browser(instance, `launch-${"u".repeat(28)}`);
    expect(
      await other.call(
        instance.progress,
        `/api/faces/${SLUG}/transfer-progress`,
        { operation_id: NEW_STEP, offer_id: OFFER },
        new Map([...other.cookies, ...oldLaunch]),
        false,
      ),
    ).toMatchObject({ status: 404, body: { code: "unknown_operation" } });
  });

  // The review's journey for the same-offer fallback. A request step another
  // session's launch sent is recovered after a sign-in and a relaunch (the
  // face has a NEW step id for the same offer) and reads back committed.
  // Another launch's entry is never settled here, so the fallback must not
  // keep answering the offer from it: the offer's next, custody, step was
  // never sent and is signed by the normal flow, and the request is never
  // sent again. Real routes, one browser jar, the old launch kept as it was.
  it("after a recovered request step commits, the offer's unsent custody step proceeds through proposal, confirmation and submission: never answered from the old request entry, and the request is never sent again", async () => {
    const runtime = fakeTransferRuntime({ advance: true });
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const instance = loadInstance();
    const browser = new Browser(instance);
    const contextId = await selected(instance, browser);
    const submit = await confirmedStep(instance, browser, contextId);
    expect((await submit()).body.reservation).toBe("won");
    const operationsPath = `/api/faces/${SLUG}/operations`;
    expect(
      (
        await browser.call(instance.operations, operationsPath, {
          transition: "record_action",
          operation_id: STEP_OP,
          action_id: "action-transfer-1",
        })
      ).status,
    ).toBe(200);
    const [[oldName, oldSealed]] = [...browser.cookies].filter(([name]) =>
      name.startsWith("dual_face_launch_"),
    );
    // Signed in again and relaunched: the same browser, a new session and
    // launch, and still the old launch's cookie.
    const relaunched = new Browser(instance, `launch-${"x".repeat(28)}`);
    relaunched.cookies.set(oldName, oldSealed);
    const progress = (body: Record<string, unknown>) =>
      relaunched.post(
        instance.progress,
        `/api/faces/${SLUG}/transfer-progress`,
        body,
      );
    const RELAUNCH_STEP = "xfer-fedcba9876543210";
    const CUSTODY_STEP = "xfer-0a1b2c3d4e5f6789";

    // The face's NEW id for the same offer: the request step it already sent
    // is read back while its outcome is open, never signed anew.
    expect(
      await progress({ operation_id: RELAUNCH_STEP, offer_id: OFFER }),
    ).toMatchObject({
      status: 200,
      body: { status: "outcome_unknown", step: "request" },
    });
    expect(runtime.calls.at(-1)).toMatchObject({
      operation: "transfer.verify",
      body: { input: { step_operation_id: STEP_OP } },
    });
    // The runtime finds the holder's request action: the recovered step
    // reads back committed (by its original id, as the host's resume reads it).
    runtime.executed(STEP_OP);
    expect(await progress({ operation_id: STEP_OP })).toMatchObject({
      status: 200,
      body: { status: "transfer_request_committed", step: "request" },
    });
    // Committed, it is finished: the offer's new ids are no longer answered
    // from it (that would hold the offer at its request step for good). The
    // custody step was never sent: unknown_operation, so it may be signed.
    for (const id of [RELAUNCH_STEP, CUSTODY_STEP]) {
      expect(
        await progress({ operation_id: id, offer_id: OFFER }),
      ).toMatchObject({ status: 404, body: { code: "unknown_operation" } });
    }

    // The normal flow for the custody step: the selected product, the
    // runtime's proposal (now its custody step), the journal begin, the
    // native confirmation and the submission with its own reservation.
    const select = await relaunched.post(
      instance.selection,
      `/api/faces/${SLUG}/selection`,
      { object_id: UNIT },
    );
    expect(select.status).toBe(200);
    const context = select.body.context_id as string;
    const proposal = await relaunched.post(
      instance.proposal,
      `/api/faces/${SLUG}/transfer-proposal`,
      { context_id: context, offer_id: OFFER, object_id: UNIT },
    );
    expect(proposal).toMatchObject({
      status: 200,
      body: {
        proposal: {
          step: "transfer",
          action: "transfer",
          offer_id: OFFER,
          recipient: RECIPIENT,
        },
      },
    });
    for (const transition of [
      {
        transition: "begin",
        kind: "transfer",
        operation: "transfer.transfer",
        object_id: UNIT,
        proposal_id: PROPOSAL,
        offer_id: OFFER,
      },
      { transition: "confirm" },
    ]) {
      expect(
        (
          await relaunched.post(instance.operations, operationsPath, {
            ...transition,
            operation_id: CUSTODY_STEP,
            context_id: context,
          })
        ).status,
      ).toBe(200);
    }
    expect(
      await relaunched.post(instance.operations, operationsPath, {
        transition: "submit",
        operation_id: CUSTODY_STEP,
        context_id: context,
      }),
    ).toMatchObject({ status: 200, body: { reservation: "won" } });
    expect(runtime.calls.at(-1)).toMatchObject({
      operation: "transfer.reserve",
      body: { operationId: CUSTODY_STEP },
    });
    // Its progress is its own, read under the custody step's id with the
    // offer the face sends: never the old request entry.
    const custodyReads = runtime.calls.length;
    expect(
      await progress({ operation_id: CUSTODY_STEP, offer_id: OFFER }),
    ).toMatchObject({
      status: 200,
      body: { status: "outcome_unknown", step: "transfer" },
    });
    runtime.executed(CUSTODY_STEP);
    expect(
      (
        await relaunched.post(instance.operations, operationsPath, {
          transition: "record_action",
          operation_id: CUSTODY_STEP,
          action_id: "action-transfer-2",
        })
      ).status,
    ).toBe(200);
    expect(
      await progress({ operation_id: CUSTODY_STEP, offer_id: OFFER }),
    ).toMatchObject({
      status: 200,
      body: { status: "transferred", step: "transfer" },
    });
    expect(
      runtime.calls
        .slice(custodyReads)
        .map((call) => [call.operation, call.body.input]),
    ).toEqual([
      ["transfer.status", { offer_id: OFFER, step_operation_id: CUSTODY_STEP }],
      [
        "transfer.verify",
        {
          offer_id: OFFER,
          action_id: "action-transfer-2",
          step_operation_id: CUSTODY_STEP,
        },
      ],
    ]);
    // The request was reserved once, by the launch that sent it, and never
    // again; the custody step has its own one reservation.
    expect(
      runtime.calls
        .filter((call) => call.operation === "transfer.reserve")
        .map((call) => call.body.operationId),
    ).toEqual([STEP_OP, CUSTODY_STEP]);
    expect(runtime.reservations).toEqual(
      new Map([
        [`${OFFER}:request`, STEP_OP],
        [`${OFFER}:transfer`, CUSTODY_STEP],
      ]),
    );
    // And the old launch's record is still there, as it was.
    expect(relaunched.cookies.get(oldName)).toBe(oldSealed);
  });

  // A step id this wallet already knows (this launch's journal, or its sealed
  // history) names its own offer. A sign request naming another offer for it
  // is malformed: refused before anything is minted, asked or written, and
  // never a reason to sign anything.
  it("a known step id asked with another offer is invalid_request before any runtime call, mint or journal write", async () => {
    const runtime = fakeTransferRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const instance = loadInstance();
    const browser = new Browser(instance);
    const contextId = await selected(instance, browser);
    const submit = await confirmedStep(instance, browser, contextId);
    expect((await submit()).body.reservation).toBe("won");
    const OTHER_OFFER = "pto-ffffffffffffffffffffffff";
    const path = `/api/faces/${SLUG}/transfer-progress`;
    const launchWrites = (setCookie: string[]) =>
      setCookie.filter((header) => header.startsWith("dual_face_launch_"));
    const calls = runtime.calls.length;
    const [[oldName, oldSealed]] = [...browser.cookies].filter(([name]) =>
      name.startsWith("dual_face_launch_"),
    );
    // This launch's own entry.
    const own = await browser.post(instance.progress, path, {
      operation_id: STEP_OP,
      offer_id: OTHER_OFFER,
    });
    expect(own).toMatchObject({
      status: 400,
      body: { code: "invalid_request" },
    });
    expect(launchWrites(own.setCookie)).toEqual([]);
    expect(browser.cookies.get(oldName)).toBe(oldSealed);
    // The same id from this wallet's sealed history, after a relaunch.
    const relaunched = new Browser(instance, `launch-${"y".repeat(28)}`);
    relaunched.cookies.set(oldName, oldSealed);
    const historical = await relaunched.post(instance.progress, path, {
      operation_id: STEP_OP,
      offer_id: OTHER_OFFER,
    });
    expect(historical).toMatchObject({
      status: 400,
      body: { code: "invalid_request" },
    });
    expect(launchWrites(historical.setCookie)).toEqual([]);
    // Nothing reached the runtime, and nothing was minted for either.
    expect(runtime.calls).toHaveLength(calls);
    // Its own offer (or none) still reads it.
    for (const body of [
      { operation_id: STEP_OP, offer_id: OFFER },
      { operation_id: STEP_OP },
    ]) {
      expect(
        await relaunched.post(instance.progress, path, body),
      ).toMatchObject({
        status: 200,
        body: { status: "outcome_unknown", step: "request" },
      });
    }
  });

  it("refuses a transfer journal entry without its offer and proposal, or for an unselected product", async () => {
    const runtime = fakeTransferRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const instance = loadInstance();
    const browser = new Browser(instance);
    const contextId = await selected(instance, browser);
    const path = `/api/faces/${SLUG}/operations`;
    for (const body of [
      { offer_id: undefined },
      { proposal_id: "psp-1" },
      { operation: "transfer.claim" },
      { context_id: "context-other-xxxxxxxxxxxx" },
    ]) {
      const begin = await browser.call(instance.operations, path, {
        transition: "begin",
        kind: "transfer",
        operation: "transfer.request",
        operation_id: STEP_OP,
        object_id: UNIT,
        context_id: contextId,
        proposal_id: PROPOSAL,
        offer_id: OFFER,
        ...body,
      });
      expect(begin.status).toBeGreaterThanOrEqual(400);
    }
    expect(runtime.calls).toHaveLength(0);
  });
});

// contract r18: the wallet's /api/backend proxy forwards each request under
// the session cookie current at THAT request. A face's holder-signed step is
// therefore bound server-side: prepare and execute carry the launch,
// operation and captured wallet, and are forwarded only while the CURRENT
// session still holds this launch's journal entry, submitted, with its own
// reservation won and no action yet. The upstream Dual API below is a LOCAL
// FAKE that only records what reaches it.
describe("contract r18: a face step is prepared and executed only by the session that won it", () => {
  const SECOND_WALLET = {
    id: "wallet-2",
    account: {
      address: "0x00000000000000000000000000000000000000d4",
      type: "SMART_WALLET",
      controller: { address: "0xcontroller2" },
      smartAccount: {},
    },
    whenCreated: new Date(),
    whenModified: new Date(),
    emailVerified: true,
  };
  const requestAction = {
    update: {
      id: UNIT,
      data: {
        custom: {
          ...OWNED_CUSTOM,
          state: "Transfer pending",
          lifecycle: { target_state: "Transfer pending" },
        },
      },
    },
  };
  const signed = {
    action: requestAction,
    nonce: 3,
    auth: { type: "webauthn", challenge: "AQID", credentialId: "c" },
  };

  /** The fake runtime for the face routes plus a recorder for upstream ebus. */
  function upstream(options: Parameters<typeof fakeTransferRuntime>[0] = {}) {
    const runtime = fakeTransferRuntime(options);
    const ebus: Array<{ path: string; body: Record<string, unknown> }> = [];
    const fetchImpl = jest.fn(async (url: string | URL, init: RequestInit) => {
      const href = String(url);
      if (!href.includes("/ebus/")) return runtime.fetchImpl(href, init);
      const path = new URL(href).pathname;
      const headers = new Headers(init.headers);
      ebus.push({
        path,
        body: JSON.parse(
          Buffer.from(init.body as ArrayBuffer).toString("utf8"),
        ) as Record<string, unknown>,
      });
      // Nothing of the face binding is forwarded upstream.
      expect(
        [...headers.keys()].filter((name) => name.startsWith("x-dual-face")),
      ).toEqual([]);
      return new Response(
        JSON.stringify(
          path.endsWith("/prepare")
            ? { nonce: 3, challenge: "AQID" }
            : { actionId: "action-transfer-1", steps: [] },
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    global.fetch = fetchImpl as unknown as typeof fetch;
    const count = (name: "prepare" | "execute") =>
      ebus.filter((call) => call.path.endsWith(`/ebus/${name}`)).length;
    return { runtime, ebus, count };
  }

  const faceHeaders = (
    browser: Browser,
    overrides: Record<string, string> = {},
  ) => ({
    "x-dual-face-launch": browser.launchId,
    "x-dual-face-slug": SLUG,
    "x-dual-face-operation": STEP_OP,
    "x-dual-face-wallet": "wallet-1",
    ...overrides,
  });

  /** A won request step, ready for the holder's prepare and execute. */
  async function wonStep(instance: Instance, browser: Browser) {
    const contextId = await selected(instance, browser);
    const submit = await confirmedStep(instance, browser, contextId);
    expect(await submit()).toMatchObject({
      status: 200,
      body: { reservation: "won" },
    });
    return contextId;
  }

  /** The same browser after another sign-in: a new session cookie, the old launch journal. */
  function switched(instance: Instance, browser: Browser) {
    const other = new Browser(instance, browser.launchId);
    const journal = [...browser.cookies].filter(([name]) =>
      name.startsWith("dual_face_launch_"),
    );
    expect(journal).toHaveLength(1);
    return new Map([...other.cookies, ...journal]);
  }

  it("forwards the won step's prepare and execute for the session that won it", async () => {
    const { count, ebus } = upstream();
    const instance = loadInstance();
    const browser = new Browser(instance);
    await wonStep(instance, browser);
    const face = faceHeaders(browser);
    expect(
      await browser.backend(
        instance,
        ["ebus", "prepare"],
        { action: requestAction },
        { face },
      ),
    ).toMatchObject({ status: 200, body: { nonce: 3, challenge: "AQID" } });
    expect(
      await browser.backend(instance, ["ebus", "execute"], signed, { face }),
    ).toMatchObject({ status: 200, body: { actionId: "action-transfer-1" } });
    expect([count("prepare"), count("execute")]).toEqual([1, 1]);
    expect(ebus[1].body).toEqual(signed);
  });

  it.each([
    [
      "an account change to another wallet",
      () => getWallet.mockResolvedValue(SECOND_WALLET),
      "face_execution_unbound",
      409,
    ],
    [
      "a new sign-in to the same wallet (another session)",
      () => undefined,
      "face_execution_unbound",
      409,
    ],
  ])(
    "after %s between prepare and execute (or while signing): 0 upstream execute, the step stays submitted and unknown, never retried",
    async (_label, change, code, status) => {
      const { count, runtime } = upstream();
      const instance = loadInstance();
      const browser = new Browser(instance);
      const contextId = await wonStep(instance, browser);
      const face = faceHeaders(browser);
      expect(
        (
          await browser.backend(
            instance,
            ["ebus", "prepare"],
            { action: requestAction },
            { face },
          )
        ).status,
      ).toBe(200);
      // The account changes while the holder signs; the signed action then
      // arrives under the NEW session cookie.
      change();
      const cookies = switched(instance, browser);
      expect(
        await browser.backend(instance, ["ebus", "execute"], signed, {
          face,
          cookies,
        }),
      ).toMatchObject({ status, body: { code } });
      // A prepare under the new session is refused the same way.
      expect(
        (
          await browser.backend(
            instance,
            ["ebus", "prepare"],
            { action: requestAction },
            { face, cookies },
          )
        ).status,
      ).toBe(status);
      // Even naming the new wallet does not help: the journal is not its own.
      expect(
        (
          await browser.backend(instance, ["ebus", "execute"], signed, {
            face: faceHeaders(browser, {
              "x-dual-face-wallet": "wallet-2",
            }),
            cookies,
          })
        ).status,
      ).toBe(409);
      expect([count("prepare"), count("execute")]).toEqual([1, 0]);
      // The original correlation is untouched: back under the session that
      // won it, the step is still submitted with no action and reads
      // outcome_unknown; nothing was cancelled, reserved again or retried.
      getWallet.mockResolvedValue({
        ...SECOND_WALLET,
        id: "wallet-1",
        account: { ...SECOND_WALLET.account, address: HOLDER },
      });
      const status_ = await browser.status(instance, STEP_OP);
      expect(status_).toMatchObject({
        status: 200,
        body: { operation_id: STEP_OP, kind: "transfer", phase: "submitted" },
      });
      expect(
        await browser.call(
          instance.progress,
          `/api/faces/${SLUG}/transfer-progress`,
          { operation_id: STEP_OP },
        ),
      ).toMatchObject({
        status: 200,
        body: { status: "outcome_unknown", step: "request" },
      });
      expect(
        runtime.calls.filter((call) => call.operation === "transfer.reserve"),
      ).toHaveLength(1);
      expect(
        await browser.call(
          instance.operations,
          `/api/faces/${SLUG}/operations`,
          {
            transition: "submit",
            operation_id: STEP_OP,
            context_id: contextId,
          },
        ),
      ).toMatchObject({
        status: 409,
        body: { code: "operation_already_submitted" },
      });
      expect(count("execute")).toBe(0);
    },
  );

  it("after a logout (no session): refused with 401 before any upstream request", async () => {
    const { count } = upstream();
    const instance = loadInstance();
    const browser = new Browser(instance);
    await wonStep(instance, browser);
    const journalOnly = new Map(
      [...browser.cookies].filter(([name]) =>
        name.startsWith("dual_face_launch_"),
      ),
    );
    expect(
      await browser.backend(instance, ["ebus", "execute"], signed, {
        face: faceHeaders(browser),
        cookies: journalOnly,
      }),
    ).toMatchObject({ status: 401, body: { code: "session_expired" } });
    expect([count("prepare"), count("execute")]).toEqual([0, 0]);
  });

  it("refuses a step whose reservation this launch did not win, or that already has its action", async () => {
    // A lost reserve answer: submitted, but never "won" here.
    const lost = upstream({ loseReserve: true });
    let instance = loadInstance();
    let browser = new Browser(instance);
    const contextId = await selected(instance, browser);
    const submit = await confirmedStep(instance, browser, contextId);
    expect(await submit()).toMatchObject({
      status: 409,
      body: { code: "outcome_unknown" },
    });
    expect(
      await browser.backend(instance, ["ebus", "execute"], signed, {
        face: faceHeaders(browser),
      }),
    ).toMatchObject({
      status: 409,
      body: { code: "face_execution_not_pending" },
    });
    expect(lost.count("execute")).toBe(0);

    // Confirmed but not yet submitted (nothing reserved).
    const early = upstream();
    instance = loadInstance();
    browser = new Browser(instance);
    await confirmedStep(instance, browser, await selected(instance, browser));
    expect(
      await browser.backend(
        instance,
        ["ebus", "prepare"],
        { action: requestAction },
        { face: faceHeaders(browser) },
      ),
    ).toMatchObject({
      status: 409,
      body: { code: "face_execution_not_pending" },
    });
    expect(early.count("prepare")).toBe(0);

    // Won, executed once and recorded: never executed again.
    const done = upstream();
    instance = loadInstance();
    browser = new Browser(instance);
    await wonStep(instance, browser);
    const face = faceHeaders(browser);
    expect(
      (await browser.backend(instance, ["ebus", "execute"], signed, { face }))
        .status,
    ).toBe(200);
    expect(
      (
        await browser.call(
          instance.operations,
          `/api/faces/${SLUG}/operations`,
          {
            transition: "record_action",
            operation_id: STEP_OP,
            action_id: "action-transfer-1",
          },
        )
      ).status,
    ).toBe(200);
    expect(
      await browser.backend(instance, ["ebus", "execute"], signed, { face }),
    ).toMatchObject({
      status: 409,
      body: { code: "face_execution_not_pending" },
    });
    expect(done.count("execute")).toBe(1);
  });

  it("refuses another unit, another action, another operation or launch, a malformed binding and any other path", async () => {
    const { count } = upstream();
    const instance = loadInstance();
    const browser = new Browser(instance);
    await wonStep(instance, browser);
    const face = faceHeaders(browser);
    const cases: Array<
      [unknown, Record<string, string>, string[], number, string]
    > = [
      [
        { action: { update: { ...requestAction.update, id: "b".repeat(24) } } },
        face,
        ["ebus", "execute"],
        400,
        "face_execution_mismatch",
      ],
      [
        { action: { transfer: { id: UNIT, to: RECIPIENT } } },
        face,
        ["ebus", "execute"],
        400,
        "face_execution_mismatch",
      ],
      [
        { action: { ...requestAction, alias: "verify_authenticity" } },
        face,
        ["ebus", "execute"],
        400,
        "face_execution_mismatch",
      ],
      [
        {
          action: { ...requestAction, burn: { id: UNIT } },
        },
        face,
        ["ebus", "execute"],
        400,
        "face_execution_mismatch",
      ],
      [
        signed,
        faceHeaders(browser, {
          "x-dual-face-operation": "xfer-ffffffffffffffff",
        }),
        ["ebus", "execute"],
        409,
        "face_execution_unbound",
      ],
      [
        signed,
        faceHeaders(browser, {
          "x-dual-face-launch": `launch-${"z".repeat(28)}`,
        }),
        ["ebus", "execute"],
        409,
        "face_execution_unbound",
      ],
      [
        signed,
        faceHeaders(browser, { "x-dual-face-wallet": "wallet-2" }),
        ["ebus", "execute"],
        409,
        "face_execution_unbound",
      ],
      [
        signed,
        faceHeaders(browser, { "x-dual-face-launch": "short" }),
        ["ebus", "execute"],
        400,
        "launch_required",
      ],
      [
        signed,
        faceHeaders(browser, { "x-dual-face-operation": "../x" }),
        ["ebus", "execute"],
        400,
        "face_execution_invalid",
      ],
      [
        signed,
        { "x-dual-face-operation": STEP_OP },
        ["ebus", "execute"],
        400,
        "face_execution_invalid",
      ],
      [signed, face, ["wallets", "me"], 405, ""],
    ];
    for (const [body, headers, path, status, code] of cases) {
      const result = await browser.backend(instance, path, body, {
        face: headers,
      });
      expect(result.status).toBe(status);
      if (code) expect(result.body).toMatchObject({ code });
    }
    expect(count("prepare") + count("execute")).toBe(0);
  });

  it("a refusal after the session was renewed carries the renewed session; its refresh token is never presented twice", async () => {
    const { count } = upstream();
    const instance = loadInstance();
    const browser = new Browser(instance);
    await wonStep(instance, browser);
    // Past the access token's expiry: this request renews the session.
    const later = Date.now() + 65 * 60 * 1000;
    const clock = jest.spyOn(Date, "now").mockReturnValue(later);
    try {
      refreshToken.mockReset().mockResolvedValue({
        accessToken: jwt({
          org_id: DEFAULT_ORGANIZATION_ID,
          exp: Math.floor(later / 1000) + 3600,
        }),
        refreshToken: jwt({ exp: Math.floor(later / 1000) + 7200 }),
      });
      const before = new Map(browser.cookies);
      const face = faceHeaders(browser, { "x-dual-face-wallet": "wallet-2" });
      expect(
        await browser.backend(instance, ["ebus", "execute"], signed, {
          face,
          keep: true,
        }),
      ).toMatchObject({
        status: 409,
        body: { code: "face_execution_unbound" },
      });
      expect(refreshToken).toHaveBeenCalledTimes(1);
      const renewed = [...browser.cookies].filter(
        ([name, value]) =>
          !name.startsWith("dual_face_launch_") && before.get(name) !== value,
      );
      expect(renewed).toHaveLength(1);
      // The next request uses the renewed session: no second refresh.
      expect(
        (
          await browser.backend(instance, ["ebus", "execute"], signed, {
            face,
            keep: true,
          })
        ).status,
      ).toBe(409);
      expect(refreshToken).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
    }
    expect(count("execute")).toBe(0);
  });

  it("the generic executor (no face binding) is forwarded unchanged", async () => {
    const { count } = upstream();
    const instance = loadInstance();
    const browser = new Browser(instance);
    expect(
      await browser.backend(instance, ["ebus", "execute"], {
        action: { pickup: { id: UNIT } },
        nonce: 0,
      }),
    ).toMatchObject({ status: 200, body: { actionId: "action-transfer-1" } });
    expect(count("execute")).toBe(1);
  });
});
