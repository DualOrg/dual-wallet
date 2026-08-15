import { getEbusApi } from "@/api/web-sdk-client";
import { executeInventoryAction } from "@/app/_services/action-executor.client";
import {
  base64urlToBytes,
  signActionWithPasskey,
} from "@/app/_adapters/webauthn.client";

jest.mock("@/api/web-sdk-client", () => ({
  getEbusApi: jest.fn(),
  normalizeApiError: jest.fn(async (error: unknown) => ({
    message: error instanceof Error ? error.message : "Action failed",
    status: 400,
  })),
}));

jest.mock("@/app/_adapters/webauthn.client", () => ({
  base64urlToBytes: jest.fn(),
  signActionWithPasskey: jest.fn(),
}));

const mockedApi = jest.mocked(getEbusApi);
const mockedPasskey = jest.mocked(signActionWithPasskey);
const mockedBase64urlToBytes = jest.mocked(base64urlToBytes);

describe("executeInventoryAction", () => {
  const action = { pickup: { id: "object-1" } };

  beforeEach(() => jest.clearAllMocks());

  it("uses the standard authenticated HTTP path for email sessions", async () => {
    const executeAction = jest
      .fn()
      .mockResolvedValue({ actionId: "action-1", steps: [] });
    const prepareAction = jest.fn();
    mockedApi.mockReturnValue({
      executeAction,
      prepareAction,
    } as unknown as ReturnType<typeof getEbusApi>);

    await executeInventoryAction(action, "email");

    expect(prepareAction).not.toHaveBeenCalled();
    expect(executeAction).toHaveBeenCalledWith({
      executeRequest: { action, nonce: 0 },
    });
  });

  it("prepares and signs the exact action challenge for passkey sessions", async () => {
    const executeAction = jest
      .fn()
      .mockResolvedValue({ actionId: "action-1", steps: [] });
    const prepareAction = jest
      .fn()
      .mockResolvedValue({ nonce: 7, challenge: "AQIDBA" });
    mockedApi.mockReturnValue({
      executeAction,
      prepareAction,
    } as unknown as ReturnType<typeof getEbusApi>);
    mockedPasskey.mockResolvedValue({
      credentialId: "credential-1",
      authenticatorData: "auth-data",
      clientDataJson: "client-data",
      signatureR: "0x01",
      signatureS: "0x02",
    });

    await executeInventoryAction(action, "passkey");

    expect(prepareAction).toHaveBeenCalledWith({
      prepareExecuteRequest: { action },
    });
    expect(mockedPasskey).toHaveBeenCalledWith("AQIDBA");
    expect(executeAction).toHaveBeenCalledWith({
      executeRequest: {
        action,
        nonce: 7,
        auth: {
          type: "webauthn",
          challenge: "AQIDBA",
          credentialId: "credential-1",
          authenticatorData: "auth-data",
          clientDataJson: "client-data",
          signatureR: "0x01",
          signatureS: "0x02",
        },
      },
    });
  });

  it("uses the EOA controller address only for personal_sign", async () => {
    const executeAction = jest
      .fn()
      .mockResolvedValue({ actionId: "action-1", steps: [] });
    const prepareAction = jest
      .fn()
      .mockResolvedValue({ nonce: 8, challenge: "AQIDBA" });
    const request = jest.fn().mockResolvedValue("0xsignature");
    mockedApi.mockReturnValue({
      executeAction,
      prepareAction,
    } as unknown as ReturnType<typeof getEbusApi>);
    mockedBase64urlToBytes.mockReturnValue(Uint8Array.from([1, 2, 3, 4]));
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request },
    });

    await executeInventoryAction(action, "eoa", "0xcontroller");

    expect(request).toHaveBeenCalledWith({
      method: "personal_sign",
      params: ["0x01020304", "0xcontroller"],
    });
    expect(executeAction).toHaveBeenCalledWith({
      executeRequest: {
        action,
        nonce: 8,
        auth: {
          type: "personal_sign",
          challenge: "AQIDBA",
          signature: "0xsignature",
        },
      },
    });
  });
});
