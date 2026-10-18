import { getEbusApi } from "@/api/web-sdk-client";
import { signActionWithPasskey } from "@/app/_adapters/webauthn.client";
import {
  executeSettleAction,
  forgetFaceHandoverTickets,
  loadProductFaceContext,
  readProgrammeProductHistory,
  takeFaceHandoverTicket,
} from "@/app/_services/product-face.client";

jest.mock("@/api/web-sdk-client", () => ({
  getEbusApi: jest.fn(),
  getObjectsApi: jest.fn(),
  normalizeApiError: jest.fn(async () => ({ message: "failed", status: 400 })),
}));
jest.mock("@/app/_adapters/webauthn.client", () => ({
  base64urlToBytes: jest.fn(() => Uint8Array.from([1, 2, 3])),
  signActionWithPasskey: jest.fn(),
}));

const mockedApi = jest.mocked(getEbusApi);
const OBJECT = "aaaaaaaaaaaaaaaaaaaaaaaa";
const input = {
  custom: {
    state: "Authenticity verified",
    lifecycle: { target_state: "Authenticity verified" },
  },
};
// The launch binding a face step carries (contract r18); always live here.
const face = {
  launchId: "launch-aaaaaaaaaaaaaaaaaaaa",
  slug: "morrow-home",
  operationId: "settle-0123456789abcdef",
  walletId: "wallet-1",
  assertLive: jest.fn(),
};
const bound = expect.any(Function);
const expectedAction = {
  update: { id: OBJECT, data: { custom: input.custom }, secret: undefined },
};

function api() {
  const executeAction = jest
    .fn()
    .mockResolvedValue({ actionId: "action-settle-1", steps: [] });
  const prepareAction = jest
    .fn()
    .mockResolvedValue({ nonce: 4, challenge: "AQID" });
  mockedApi.mockReturnValue({
    executeAction,
    prepareAction,
  } as unknown as ReturnType<typeof getEbusApi>);
  return { executeAction, prepareAction };
}

describe("holder settle execution", () => {
  beforeEach(() => jest.clearAllMocks());

  it("executes the exact proposal through the email path with the wallet's current action number", async () => {
    const { executeAction, prepareAction } = api();
    await expect(
      executeSettleAction({
        objectId: OBJECT,
        action: "update",
        input,
        authenticationMethod: "email",
        face,
      }),
    ).resolves.toEqual({ actionId: "action-settle-1" });
    // The same exact body is prepared (bound) and then executed, unsigned.
    expect(prepareAction).toHaveBeenCalledWith(
      { prepareExecuteRequest: { action: expectedAction } },
      bound,
    );
    expect(executeAction).toHaveBeenCalledWith(
      { executeRequest: { action: expectedAction, nonce: 4 } },
      bound,
    );
    expect(executeAction).toHaveBeenCalledTimes(1);
  });

  it("prepares and signs as the holder for passkey sessions", async () => {
    const { executeAction, prepareAction } = api();
    jest.mocked(signActionWithPasskey).mockResolvedValue({
      credentialId: "credential-1",
      clientDataJson: "client",
      authenticatorData: "auth",
      signature: "sig",
    } as never);
    await executeSettleAction({
      objectId: OBJECT,
      action: "update",
      alias: "verify_authenticity",
      input,
      authenticationMethod: "passkey",
      face,
    });
    expect(prepareAction).toHaveBeenCalledWith(
      {
        prepareExecuteRequest: {
          action: { ...expectedAction, alias: "verify_authenticity" },
        },
      },
      bound,
    );
    expect(signActionWithPasskey).toHaveBeenCalledWith("AQID");
    expect(executeAction).toHaveBeenCalledWith(
      { executeRequest: expect.objectContaining({ nonce: 4 }) },
      bound,
    );
  });

  it("signs with the connected EOA for EOA sessions", async () => {
    const { executeAction } = api();
    const request = jest.fn().mockResolvedValue("0xsignature");
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request },
    });
    await executeSettleAction({
      objectId: OBJECT,
      action: "update",
      input,
      authenticationMethod: "eoa",
      controllerAddress: "0xcontroller",
      face,
    });
    expect(request).toHaveBeenCalledWith({
      method: "personal_sign",
      params: ["0x010203", "0xcontroller"],
    });
    expect(executeAction).toHaveBeenCalledTimes(1);
  });

  it("maps the reviewed Dual update body onto the same executor input", async () => {
    const { executeAction } = api();
    await executeSettleAction({
      objectId: OBJECT,
      action: "update",
      input: { data: { custom: input.custom } },
      authenticationMethod: "email",
      face,
    });
    expect(executeAction).toHaveBeenCalledWith(
      { executeRequest: { action: expectedAction, nonce: 4 } },
      bound,
    );
    await expect(
      executeSettleAction({
        objectId: OBJECT,
        action: "update",
        input: { data: { custom: input.custom, secret: "x" } },
        authenticationMethod: "email",
        face,
      }),
    ).rejects.toMatchObject({ code: "proposal_rejected" });
  });

  it.each(["claim_ownership", "transfer", "burn", "permit"])(
    "never executes %s as a settle",
    async (action) => {
      const { executeAction, prepareAction } = api();
      await expect(
        executeSettleAction({
          objectId: OBJECT,
          action,
          input: {},
          authenticationMethod: "email",
          face,
        }),
      ).rejects.toMatchObject({ code: "proposal_rejected" });
      expect(executeAction).not.toHaveBeenCalled();
      expect(prepareAction).not.toHaveBeenCalled();
    },
  );
});

describe("launch-local handover tickets (contract r14)", () => {
  const TICKET = "k".repeat(43);
  const contextAnswer = () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        application: {},
        frameUrl: "https://faces.example/face/",
        handover: { ticket: TICKET },
      }),
    }) as unknown as Response;

  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = jest.fn(async () => contextAnswer()) as typeof fetch;
  });
  afterEach(() => {
    forgetFaceHandoverTickets();
    global.fetch = originalFetch;
  });

  it("are held for their launch only, taken once, and kept out of the context", async () => {
    const context = await loadProductFaceContext(
      { slug: "morrow-home", launchId: "launch-a" },
      "/register",
    );
    expect(context).not.toHaveProperty("handover");
    expect(takeFaceHandoverTicket("launch-b")).toBeUndefined();
    expect(takeFaceHandoverTicket("launch-a")).toEqual({
      kind: "handover",
      ticket: TICKET,
    });
    expect(takeFaceHandoverTicket("launch-a")).toBeUndefined();
  });

  it("are forgotten when the session ends or changes account", async () => {
    await loadProductFaceContext(
      { slug: "morrow-home", launchId: "launch-c" },
      "/register",
    );
    forgetFaceHandoverTickets();
    expect(takeFaceHandoverTicket("launch-c")).toBeUndefined();
  });
});

// Live finding (fresh Mug, minted 18 October): its History listed a transfer
// from 16 October and updates back to 25 September, the account's other
// actions. The list's object_id filter is not trusted alone: each entry's own
// affected objects must name the exact object.
describe("exact-product history", () => {
  const MUG = "6ad42c64f62f7c23306b2a6b";
  const OTHER = "6ad0000000000000000000ff";
  let day = 0;
  const log = (
    id: string,
    objects: string[],
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    name: "update",
    status: "completed",
    whenCreated: new Date(
      Date.UTC(2026, 9, 18, 4, 47, 35) - (day += 1) * 3600e3,
    ),
    affectedObjects: objects.map((objectId) => ({ id: objectId })),
    ...extra,
  });
  function pages(...answers: { actionLogs: unknown[]; next?: string }[]) {
    const listActionLogs = jest.fn();
    for (const answer of answers) listActionLogs.mockResolvedValueOnce(answer);
    mockedApi.mockReturnValue({
      listActionLogs,
    } as unknown as ReturnType<typeof getEbusApi>);
    return listActionLogs;
  }
  beforeEach(() => {
    jest.clearAllMocks();
    day = 0;
  });

  it("shows only actions whose own affected objects name the exact object, newest first, each with its own action id and status", async () => {
    const listActionLogs = pages({
      actionLogs: [
        log("act-final", [MUG], { alias: "settle" }),
        log("act-other-transfer", [OTHER], { name: "transfer" }),
        log("act-batch", [OTHER, MUG], { status: "pending" }),
        log("act-old-update", [OTHER]),
        log("act-failed", [MUG], { status: "failed" }),
        log("act-mint", [MUG], { name: "mint" }),
        log("act-none", []),
      ],
    });
    const entries = await readProgrammeProductHistory(MUG);
    expect(
      entries.map(({ actionId, action, status }) => [actionId, action, status]),
    ).toEqual([
      ["act-final", "settle", "completed"],
      ["act-batch", "update", "pending"],
      ["act-failed", "update", "failed"],
      ["act-mint", "mint", "completed"],
    ]);
    expect(listActionLogs).toHaveBeenCalledTimes(1);
    expect(listActionLogs).toHaveBeenCalledWith({
      objectId: MUG,
      limit: 25,
      order: "desc",
      sortBy: "when_created",
      next: undefined,
    });
  });

  it("reads further pages (same filters, the list's own next marker) until the list ends, and never repeats an action", async () => {
    const listActionLogs = pages(
      { actionLogs: [log("a1", [OTHER]), log("a2", [OTHER])], next: "page-2" },
      { actionLogs: [log("a3", [MUG]), log("a2", [OTHER])], next: "page-3" },
      { actionLogs: [log("a3", [MUG]), log("a4", [MUG], { name: "mint" })] },
    );
    const entries = await readProgrammeProductHistory(MUG);
    expect(entries.map((entry) => entry.actionId)).toEqual(["a3", "a4"]);
    expect(listActionLogs.mock.calls.map(([request]) => request.next)).toEqual([
      undefined,
      "page-2",
      "page-3",
    ]);
  });

  it("an ended list with no action on the object is an empty history; an unfinished scan that found none is unavailable, never empty", async () => {
    pages({ actionLogs: [log("o1", [OTHER])] });
    await expect(readProgrammeProductHistory(MUG)).resolves.toEqual([]);

    const unfinished = Array.from({ length: 8 }, (_, index) => ({
      actionLogs: [log(`o-${index}`, [OTHER])],
      next: `page-${index + 2}`,
    }));
    const listActionLogs = pages(...unfinished);
    await expect(readProgrammeProductHistory(MUG)).rejects.toMatchObject({
      name: "ProductFaceError",
      code: "temporarily_unavailable",
    });
    expect(listActionLogs).toHaveBeenCalledTimes(8);
  });

  it("an unfinished scan that found the object's newest actions shows exactly those", async () => {
    const answers = Array.from({ length: 8 }, (_, index) => ({
      actionLogs: [log(`p-${index}`, index === 1 ? [MUG] : [OTHER])],
      next: `page-${index + 2}`,
    }));
    pages(...answers);
    const entries = await readProgrammeProductHistory(MUG);
    expect(entries.map((entry) => entry.actionId)).toEqual(["p-1"]);
  });

  it("stops at 25 of the object's own entries", async () => {
    const listActionLogs = pages({
      actionLogs: Array.from({ length: 25 }, (_, index) =>
        log(`m-${index}`, [MUG]),
      ),
      next: "page-2",
    });
    const entries = await readProgrammeProductHistory(MUG);
    expect(entries).toHaveLength(25);
    expect(listActionLogs).toHaveBeenCalledTimes(1);
  });

  it("a list that cannot be read is unavailable", async () => {
    const listActionLogs = jest
      .fn()
      .mockRejectedValue({ response: { status: 503 } });
    mockedApi.mockReturnValue({
      listActionLogs,
    } as unknown as ReturnType<typeof getEbusApi>);
    await expect(readProgrammeProductHistory(MUG)).rejects.toMatchObject({
      code: "temporarily_unavailable",
      status: 503,
    });
  });
});
