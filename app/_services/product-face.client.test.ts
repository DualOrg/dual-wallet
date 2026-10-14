import { getEbusApi } from "@/api/web-sdk-client";
import { signActionWithPasskey } from "@/app/_adapters/webauthn.client";
import {
  executeSettleAction,
  forgetFaceHandoverTickets,
  loadProductFaceContext,
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

  it("executes the exact proposal through the email path", async () => {
    const { executeAction, prepareAction } = api();
    await expect(
      executeSettleAction({
        objectId: OBJECT,
        action: "update",
        input,
        authenticationMethod: "email",
      }),
    ).resolves.toEqual({ actionId: "action-settle-1" });
    expect(prepareAction).not.toHaveBeenCalled();
    expect(executeAction).toHaveBeenCalledWith({
      executeRequest: { action: expectedAction, nonce: 0 },
    });
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
    });
    expect(prepareAction).toHaveBeenCalledWith({
      prepareExecuteRequest: {
        action: { ...expectedAction, alias: "verify_authenticity" },
      },
    });
    expect(signActionWithPasskey).toHaveBeenCalledWith("AQID");
    expect(executeAction).toHaveBeenCalledWith({
      executeRequest: expect.objectContaining({ nonce: 4 }),
    });
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
    });
    expect(executeAction).toHaveBeenCalledWith({
      executeRequest: { action: expectedAction, nonce: 0 },
    });
    await expect(
      executeSettleAction({
        objectId: OBJECT,
        action: "update",
        input: { data: { custom: input.custom, secret: "x" } },
        authenticationMethod: "email",
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
