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
import { bindingInput, HOLDER, TEMPLATE_A } from "@/test/product-face-fixtures";

const getWallet = jest.fn();
const getObjectById = jest.fn();
const getObjectByIdPublic = jest.fn();
jest.mock("@/api/web-sdk-client", () => ({
  getWalletsApi: () => ({ getWallet, logout: jest.fn() }),
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

type StatusHandler = (
  request: NextRequest,
  context: { params: Promise<{ slug: string; operationId: string }> },
) => Promise<Response>;

interface Instance {
  selection: Handler;
  operations: Handler;
  proposal: Handler;
  progress: Handler;
  status: StatusHandler;
  establishSession: typeof import("@/api/server-session").establishSession;
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
      proposal: require("@/app/api/faces/[slug]/transfer-proposal/route").POST,
      progress: require("@/app/api/faces/[slug]/transfer-progress/route").POST,
      status: require("@/app/api/faces/[slug]/operations/[operationId]/route")
        .GET,
      establishSession: session.establishSession,
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
 * verify/status commit a step only when the test reports the holder's action.
 */
function fakeTransferRuntime({
  step = "request" as Step,
  propose = undefined as
    undefined | ((body: Record<string, unknown>) => Record<string, unknown>),
  cancelled = false,
  loseReserve = false,
} = {}) {
  const calls: Array<{
    origin: string | null;
    operation: string;
    claims: Record<string, unknown>;
    body: Record<string, unknown>;
  }> = [];
  const reservations = new Map<string, string>();
  const executed = new Set<string>();
  const stepAnswer = (objectId: string) => {
    const input =
      step === "transfer"
        ? { to: RECIPIENT }
        : {
            data: {
              custom: {
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

const original = global.fetch;
beforeEach(() => {
  process.env.PRODUCT_FACE_APPLICATIONS = JSON.stringify([bindingInput()]);
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
  const owned = {
    id: UNIT,
    templateId: TEMPLATE_A,
    owner: HOLDER,
    custom: { recordId: "rec-0001", state: "Authenticity verified" },
    metadata: { name: "Arc grinder" },
    whenModified: new Date("2026-10-01T00:00:00Z"),
  };
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
