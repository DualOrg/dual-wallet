/**
 * @jest-environment node
 */
// contract r8/r11 durable reservation, through the real BFF routes:
// - the holder settle may run only on a reserve answer that this request
//   itself received with dispatch:"won";
// - two independently loaded BFF module instances (separate process-local
//   state, as on two servers) sharing the same cookie and the SAME
//   settle_operation_id: exactly one won, exactly one holder execution;
// - a lost reserve response, a replay, already_claimed and already_reserved
//   execute nothing, are never re-reserved, and the journal keeps ids,
//   hashes and phases only.
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
const PROPOSAL = "psp-0123456789abcdef01234567";
const SETTLE_OP = "settle-0123456789abcdef";
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

const canonical = (value: Record<string, string>) =>
  `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${JSON.stringify(value[key])}`)
    .join(",")}}`;
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

/**
 * LOCAL FAKE of the runtime reserve (contract r11): dispatch:"won" only on the
 * single call that atomically creates the reservation; every later call,
 * including the same settle_operation_id, is already_claimed. It counts the
 * holder executions the test's host performs, which happen only on "won".
 */
function fakeRuntime({ loseResponses = false } = {}) {
  const reservations = new Map<
    string,
    { settleOperationId: string; proposalId: string }
  >();
  const calls: Array<{
    origin: string | null;
    claims: Record<string, unknown>;
    body: Record<string, unknown>;
  }> = [];
  let executions = 0;
  const fetchImpl = jest.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const headers = new Headers(init.headers);
    const claims = JSON.parse(
      Buffer.from(String(body.assertion).split(".")[1], "base64url").toString(
        "utf8",
      ),
    ) as Record<string, unknown>;
    calls.push({ origin: headers.get("origin"), claims, body });
    const target = body.target as { object_id: string };
    const input = body.input as { proposal_id: string };
    const expectedHash = sha256(
      canonical({
        proposal_id: input.proposal_id,
        settle_operation_id: String(body.operationId),
        object_id: target.object_id,
      }),
    );
    if (
      body.operation !== "registration.settle.reserve" ||
      claims.operation !== "registration.settle.reserve" ||
      claims.op_id !== body.operationId ||
      claims.request_hash !== expectedHash
    ) {
      return new Response(
        JSON.stringify({ ok: false, status: "face_assertion_mismatch" }),
        { status: 403 },
      );
    }
    // Interleave concurrent callers before the atomic step.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const existing = reservations.get(target.object_id);
    let answer: Response;
    if (!existing) {
      reservations.set(target.object_id, {
        settleOperationId: String(body.operationId),
        proposalId: input.proposal_id,
      });
      answer = new Response(
        JSON.stringify({
          ok: true,
          status: "granted",
          dispatch: "won",
          reservation: {
            proposal_id: input.proposal_id,
            settle_operation_id: body.operationId,
            object_id: target.object_id,
            state: "granted",
            action_id: null,
          },
        }),
        { status: 200 },
      );
    } else if (existing.settleOperationId === body.operationId) {
      answer = new Response(
        JSON.stringify({
          ok: true,
          status: "granted",
          idempotent: true,
          dispatch: "already_claimed",
          reservation: {
            settle_operation_id: body.operationId,
            object_id: target.object_id,
            proposal_id: existing.proposalId,
            state: "granted",
          },
        }),
        { status: 200 },
      );
    } else {
      answer = new Response(
        JSON.stringify({
          ok: false,
          status: "already_reserved",
          dispatch: "already_claimed",
          reservation: { state: "granted" },
        }),
        { status: 409 },
      );
    }
    if (loseResponses)
      throw new TypeError("connection reset after the reservation");
    return answer;
  });
  return {
    fetchImpl,
    calls,
    reservations,
    /** The host executes the holder action only on a "won" journal answer. */
    hostExecutes(result: { status: number; body: Record<string, unknown> }) {
      if (result.status === 200 && result.body.reservation === "won")
        executions += 1;
    },
    get executions() {
      return executions;
    },
  };
}

async function confirmedSettle(
  instance: Instance,
  browser: Browser,
  settleOperationId = SETTLE_OP,
) {
  const selected = await browser.call(
    instance.selection,
    `/api/faces/${SLUG}/selection`,
    { object_id: UNIT },
  );
  expect(selected.status).toBe(200);
  const contextId = selected.body.context_id as string;
  const path = `/api/faces/${SLUG}/operations`;
  expect(
    (
      await browser.call(instance.operations, path, {
        transition: "begin",
        kind: "settle",
        operation: "update",
        operation_id: settleOperationId,
        object_id: UNIT,
        context_id: contextId,
        proposal_id: PROPOSAL,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await browser.call(instance.operations, path, {
        transition: "confirm",
        operation_id: settleOperationId,
        context_id: contextId,
      })
    ).status,
  ).toBe(200);
  return {
    contextId,
    submit: (target: Instance, cookies?: Map<string, string>, keep = true) =>
      browser.call(
        target.operations,
        path,
        {
          transition: "submit",
          operation_id: settleOperationId,
          context_id: contextId,
        },
        cookies,
        keep,
      ),
  };
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
  getObjectById.mockReset().mockResolvedValue(pendingUnit());
  getObjectByIdPublic.mockReset().mockResolvedValue(pendingUnit());
});

/** The unit after the first-owner handoff: owned, state still pending. */
function pendingUnit(custom: Record<string, unknown> = {}) {
  return {
    id: UNIT,
    templateId: TEMPLATE_A,
    owner: HOLDER,
    custom: { recordId: "rec-0001", state: "Transfer pending", ...custom },
    metadata: { name: "Arc grinder" },
    whenModified: new Date("2026-10-01T00:00:00Z"),
  };
}
afterEach(() => {
  global.fetch = original;
  delete process.env.PRODUCT_FACE_APPLICATIONS;
  delete process.env.FACE_ASSERTION_KEY_ID;
  delete process.env.FACE_ASSERTION_SIGNING_KEY;
});

describe("settle reservation (contract r8/r11)", () => {
  it("two independent BFF instances, the same cookie and the SAME settle operation: one won, one execution", async () => {
    const runtime = fakeRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const first = loadInstance();
    const second = loadInstance();
    const browser = new Browser(first);
    const settle = await confirmedSettle(first, browser);
    const sameCookie = browser.snapshot();
    const results = await Promise.all([
      settle.submit(first, sameCookie, false),
      settle.submit(second, sameCookie, false),
    ]);
    results.forEach((result) => runtime.hostExecutes(result));
    expect(runtime.executions).toBe(1);
    expect(
      results
        .map((result) => result.body.reservation ?? result.body.code)
        .sort(),
    ).toEqual(["outcome_unknown", "won"]);
    // Server to server: no browser Origin reached the runtime.
    expect(runtime.calls.every((call) => call.origin === null)).toBe(true);
    expect(runtime.calls).toHaveLength(2);
  });

  it("a replay after won is already_claimed: no execution, and the same launch never re-reserves", async () => {
    const runtime = fakeRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const instance = loadInstance();
    const browser = new Browser(instance);
    const settle = await confirmedSettle(instance, browser);
    const stale = browser.snapshot();
    const won = await settle.submit(instance);
    runtime.hostExecutes(won);
    expect(won.body.reservation).toBe("won");
    // A replay of the same request from the old cookie (another instance).
    const replay = await settle.submit(loadInstance(), stale, false);
    runtime.hostExecutes(replay);
    expect(replay).toMatchObject({
      status: 409,
      body: { code: "outcome_unknown" },
    });
    // The same launch's journal says submitted: nothing is reserved again.
    const again = await settle.submit(instance);
    runtime.hostExecutes(again);
    expect(again).toMatchObject({
      status: 409,
      body: { code: "operation_already_submitted" },
    });
    expect(runtime.executions).toBe(1);
    expect(runtime.calls).toHaveLength(2);
  });

  it("a lost reserve response executes nothing and is never reclaimed by re-reserving", async () => {
    const runtime = fakeRuntime({ loseResponses: true });
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const instance = loadInstance();
    const browser = new Browser(instance);
    const settle = await confirmedSettle(instance, browser);
    const lost = await settle.submit(instance);
    runtime.hostExecutes(lost);
    expect(lost).toMatchObject({
      status: 409,
      body: { code: "outcome_unknown" },
    });
    // The runtime did create the reservation; the wallet never learned it won.
    expect(runtime.reservations.size).toBe(1);
    const retry = await settle.submit(instance);
    runtime.hostExecutes(retry);
    expect(retry.status).toBe(409);
    expect(runtime.calls).toHaveLength(1);
    expect(runtime.executions).toBe(0);
  });

  it("another settle operation for the same unit is already_reserved: no execution", async () => {
    const runtime = fakeRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const instance = loadInstance();
    const tabA = new Browser(instance, `launch-${"a".repeat(28)}`);
    const tabB = new Browser(instance, `launch-${"b".repeat(28)}`);
    tabB.cookies = tabA.snapshot();
    const settleA = await confirmedSettle(
      instance,
      tabA,
      "settle-aaaaaaaaaaaa",
    );
    const settleB = await confirmedSettle(
      instance,
      tabB,
      "settle-bbbbbbbbbbbb",
    );
    const results = await Promise.all([
      settleA.submit(instance),
      settleB.submit(instance),
    ]);
    results.forEach((result) => runtime.hostExecutes(result));
    expect(runtime.executions).toBe(1);
  });

  it("the launch journal keeps ids, hashes and phases only", async () => {
    const runtime = fakeRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const instance = loadInstance();
    const browser = new Browser(instance);
    await (await confirmedSettle(instance, browser)).submit(instance);
    const name = `dual_face_launch_${browser.launchId}`;
    const sealed = instance.unsealForPurpose(
      `dual-face-journal-v2:${browser.launchId}`,
      browser.cookies.get(name)!,
    ) as { entries: Array<Record<string, unknown>> };
    expect(sealed.entries).toHaveLength(1);
    expect(Object.keys(sealed.entries[0]).sort()).toEqual(
      [
        "createdAt",
        "issuedAt",
        "kind",
        "objectId",
        "operation",
        "operationId",
        "phase",
        "proposalId",
        "updatedAt",
      ].sort(),
    );
    expect(sealed.entries[0]).toMatchObject({
      operationId: SETTLE_OP,
      phase: "submitted",
      proposalId: PROPOSAL,
    });
  });

  it("refuses before the reserve when the fresh custom map has a key the template does not list (r7)", async () => {
    const runtime = fakeRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const instance = loadInstance();
    const browser = new Browser(instance);
    const settle = await confirmedSettle(instance, browser);
    // Between the confirmation and the submit the unit gains a custom key an
    // update could drop under replace semantics.
    getObjectById.mockResolvedValue(pendingUnit({ warrantyNote: "keep" }));
    const refused = await settle.submit(instance);
    expect(refused).toMatchObject({
      status: 409,
      body: { code: "proposal_rejected" },
    });
    expect(runtime.calls).toHaveLength(0);
    // Nothing left the wallet: the entry is still confirmed and cancellable.
    const cancelled = await browser.call(
      instance.operations,
      `/api/faces/${SLUG}/operations`,
      { transition: "cancel", operation_id: SETTLE_OP },
    );
    expect(cancelled).toMatchObject({
      status: 200,
      body: { operation: { phase: "cancelled", status: "not_submitted" } },
    });
  });

  it("a won reservation is never released: unknown after proposal expiry with an empty history, never replaced (r13)", async () => {
    const runtime = fakeRuntime();
    global.fetch = runtime.fetchImpl as unknown as typeof fetch;
    const instance = loadInstance();
    const browser = new Browser(instance);
    const settle = await confirmedSettle(instance, browser);
    const won = await settle.submit(instance);
    expect(won.body.reservation).toBe("won");
    // The host executed, but the execute answer was lost: no action id was
    // recorded. The unit's state and history show nothing yet.
    runtime.hostExecutes(won);

    // Well past any proposal expiry (the session itself still valid).
    const realNow = Date.now;
    const later = realNow() + 30 * 60_000;
    jest.spyOn(Date, "now").mockImplementation(() => later);
    try {
      const status = await browser.status(instance, SETTLE_OP);
      expect(status).toMatchObject({
        status: 200,
        body: { phase: "submitted", status: "outcome_unknown" },
      });
      // Never cancelled into not_submitted.
      expect(
        await browser.call(
          instance.operations,
          `/api/faces/${SLUG}/operations`,
          { transition: "cancel", operation_id: SETTLE_OP },
        ),
      ).toMatchObject({
        status: 409,
        body: { code: "operation_already_submitted" },
      });
      // A replacement settle of the same unit in this launch is refused
      // before anything reaches the runtime.
      const selected = await browser.call(
        instance.selection,
        `/api/faces/${SLUG}/selection`,
        { object_id: UNIT },
      );
      expect(
        await browser.call(
          instance.operations,
          `/api/faces/${SLUG}/operations`,
          {
            transition: "begin",
            kind: "settle",
            operation: "update",
            operation_id: "settle-replacement-0001",
            object_id: UNIT,
            context_id: selected.body.context_id,
            proposal_id: "psp-replacement-0000000000001",
          },
        ),
      ).toMatchObject({ status: 409, body: { code: "operation_conflict" } });
      expect(runtime.calls).toHaveLength(1);
    } finally {
      jest.restoreAllMocks();
    }

    // Another launch (a fresh tab) may ask, but the runtime still holds the
    // original claim: already_reserved, outcome_unknown, never won.
    const fresh = new Browser(instance, `launch-${"r".repeat(28)}`);
    fresh.cookies = new Map(
      [...browser.cookies].filter(
        ([name]) => !name.startsWith("dual_face_launch_"),
      ),
    );
    const replacement = await confirmedSettle(
      instance,
      fresh,
      "settle-replacement-0002",
    );
    const answer = await replacement.submit(instance);
    runtime.hostExecutes(answer);
    expect(answer).toMatchObject({
      status: 409,
      body: { code: "outcome_unknown" },
    });
    expect(runtime.reservations.get(UNIT)?.settleOperationId).toBe(SETTLE_OP);
    expect(runtime.executions).toBe(1);
    // The original stays unknown in its own launch.
    expect((await browser.status(instance, SETTLE_OP)).body).toMatchObject({
      status: "outcome_unknown",
    });
  });

  it("refuses any face request that names no launch", async () => {
    const instance = loadInstance();
    const browser = new Browser(instance);
    const response = await instance.selection(
      new NextRequest(`http://localhost/api/faces/${SLUG}/selection`, {
        method: "POST",
        headers: {
          host: "localhost",
          origin: "http://localhost",
          "content-type": "application/json",
          cookie: Array.from(browser.cookies, ([k, v]) => `${k}=${v}`).join(
            "; ",
          ),
        },
        body: JSON.stringify({ object_id: UNIT }),
      }),
      { params: Promise.resolve({ slug: SLUG }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "launch_required" });
  });
});
