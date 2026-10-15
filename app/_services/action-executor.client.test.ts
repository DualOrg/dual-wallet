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

  it("sends an email session's current action number from prepare, unsigned (custodial)", async () => {
    const executeAction = jest
      .fn()
      .mockResolvedValue({ actionId: "action-1", steps: [] });
    // The wallet has already acted: its current action number is 9, not 0.
    const prepareAction = jest
      .fn()
      .mockResolvedValue({ nonce: 9, challenge: "AQIDBA" });
    mockedApi.mockReturnValue({
      executeAction,
      prepareAction,
    } as unknown as ReturnType<typeof getEbusApi>);

    await executeInventoryAction(action, "email");

    expect(prepareAction).toHaveBeenCalledWith({
      prepareExecuteRequest: { action },
    });
    expect(executeAction).toHaveBeenCalledWith({
      executeRequest: { action, nonce: 9 },
    });
    expect(executeAction.mock.calls[0][0].executeRequest).not.toHaveProperty(
      "auth",
    );
  });

  it("never retries a refused email execute (one prepare, one execute)", async () => {
    const executeAction = jest
      .fn()
      .mockRejectedValue(new Error("invalid nonce: expected 10, got 9"));
    const prepareAction = jest
      .fn()
      .mockResolvedValue({ nonce: 9, challenge: "AQIDBA" });
    mockedApi.mockReturnValue({
      executeAction,
      prepareAction,
    } as unknown as ReturnType<typeof getEbusApi>);

    await expect(executeInventoryAction(action, "email")).rejects.toThrow(
      "invalid nonce: expected 10, got 9",
    );
    expect(prepareAction).toHaveBeenCalledTimes(1);
    expect(executeAction).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, -1, 1.5, Number.NaN, "9"])(
    "sends nothing when prepare returns an unusable action number (%p)",
    async (nonce) => {
      const executeAction = jest.fn();
      const prepareAction = jest
        .fn()
        .mockResolvedValue({ nonce, challenge: "AQIDBA" });
      mockedApi.mockReturnValue({
        executeAction,
        prepareAction,
      } as unknown as ReturnType<typeof getEbusApi>);
      await expect(executeInventoryAction(action, "email")).rejects.toThrow();
      expect(executeAction).not.toHaveBeenCalled();
    },
  );

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

  // contract r18: a face's holder-signed step. The executor re-checks the
  // live identity at every async boundary and binds every request to the
  // launch, operation and captured wallet (enforced again by the proxy).
  describe("a face step", () => {
    const binding = {
      launchId: "launch-aaaaaaaaaaaaaaaaaaaaaa",
      slug: "morrow-home",
      operationId: "xfer-0123456789abcdef",
      walletId: "wallet-a",
    };
    class SessionEnded extends Error {
      code = "session_ended";
    }

    /** A face whose identity stops being live once `end()` is called. */
    function face() {
      let ended = false;
      return {
        ...binding,
        assertLive: jest.fn(() => {
          if (ended) throw new SessionEnded("session ended");
        }),
        end: () => {
          ended = true;
        },
      };
    }

    function ebus() {
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
      return { executeAction, prepareAction };
    }

    it("binds prepare and execute to the launch, operation and captured wallet", async () => {
      const { executeAction, prepareAction } = ebus();
      mockedPasskey.mockResolvedValue({
        credentialId: "credential-1",
        authenticatorData: "auth-data",
        clientDataJson: "client-data",
        signatureR: "0x01",
        signatureS: "0x02",
      });
      const step = face();
      await executeInventoryAction(action, "passkey", undefined, step);
      for (const call of [
        prepareAction.mock.calls[0],
        executeAction.mock.calls[0],
      ]) {
        const override = call[1] as (context: {
          init: { headers: Record<string, string> };
        }) => Promise<{ headers: Record<string, string> }>;
        await expect(
          override({
            init: { headers: { "Content-Type": "application/json" } },
          }),
        ).resolves.toEqual({
          headers: {
            "Content-Type": "application/json",
            "x-dual-face-launch": binding.launchId,
            "x-dual-face-slug": binding.slug,
            "x-dual-face-operation": binding.operationId,
            "x-dual-face-wallet": binding.walletId,
          },
        });
      }
      // Before preparing, after preparing, after signing.
      expect(step.assertLive).toHaveBeenCalledTimes(3);
    });

    it("an account switch while awaiting the passkey signature: 0 execute", async () => {
      const { executeAction, prepareAction } = ebus();
      const step = face();
      mockedPasskey.mockImplementation(async () => {
        step.end();
        return {
          credentialId: "credential-1",
          authenticatorData: "auth-data",
          clientDataJson: "client-data",
          signatureR: "0x01",
          signatureS: "0x02",
        };
      });
      await expect(
        executeInventoryAction(action, "passkey", undefined, step),
      ).rejects.toBeInstanceOf(SessionEnded);
      expect(prepareAction).toHaveBeenCalledTimes(1);
      expect(executeAction).not.toHaveBeenCalled();
    });

    it("an account switch while awaiting the EOA signature: 0 execute", async () => {
      const { executeAction } = ebus();
      const step = face();
      mockedBase64urlToBytes.mockReturnValue(Uint8Array.from([1, 2, 3, 4]));
      Object.defineProperty(window, "ethereum", {
        configurable: true,
        value: {
          request: jest.fn(async () => {
            step.end();
            return "0xsignature";
          }),
        },
      });
      await expect(
        executeInventoryAction(action, "eoa", "0xcontroller", step),
      ).rejects.toBeInstanceOf(SessionEnded);
      expect(executeAction).not.toHaveBeenCalled();
    });

    it("an account switch while preparing: nothing is signed or executed", async () => {
      const { executeAction, prepareAction } = ebus();
      const step = face();
      prepareAction.mockImplementation(async () => {
        step.end();
        return { nonce: 7, challenge: "AQIDBA" };
      });
      await expect(
        executeInventoryAction(action, "passkey", undefined, step),
      ).rejects.toBeInstanceOf(SessionEnded);
      expect(mockedPasskey).not.toHaveBeenCalled();
      expect(executeAction).not.toHaveBeenCalled();
    });

    it("an email step whose identity is no longer live is never executed", async () => {
      const { executeAction, prepareAction } = ebus();
      const step = face();
      step.end();
      await expect(
        executeInventoryAction(action, "email", undefined, step),
      ).rejects.toBeInstanceOf(SessionEnded);
      expect(prepareAction).not.toHaveBeenCalled();
      expect(executeAction).not.toHaveBeenCalled();
    });

    it("an email step binds prepare and execute, and sends the prepared number", async () => {
      const { executeAction, prepareAction } = ebus();
      const step = face();
      await executeInventoryAction(action, "email", undefined, step);
      expect(prepareAction).toHaveBeenCalledTimes(1);
      expect(executeAction).toHaveBeenCalledWith(
        { executeRequest: { action, nonce: 7 } },
        expect.any(Function),
      );
      for (const call of [
        prepareAction.mock.calls[0],
        executeAction.mock.calls[0],
      ]) {
        const override = call[1] as (context: {
          init: { headers: Record<string, string> };
        }) => Promise<{ headers: Record<string, string> }>;
        await expect(
          override({ init: { headers: {} } }),
        ).resolves.toMatchObject({
          headers: { "x-dual-face-operation": binding.operationId },
        });
      }
      // Before preparing and after preparing (immediately before executing).
      expect(step.assertLive).toHaveBeenCalledTimes(2);
    });

    it("an email step whose session ends while preparing is never executed", async () => {
      const { executeAction, prepareAction } = ebus();
      const step = face();
      prepareAction.mockImplementation(async () => {
        step.end();
        return { nonce: 7, challenge: "AQIDBA" };
      });
      await expect(
        executeInventoryAction(action, "email", undefined, step),
      ).rejects.toBeInstanceOf(SessionEnded);
      expect(executeAction).not.toHaveBeenCalled();
    });

    it("the generic executor sends no face binding", async () => {
      const { executeAction, prepareAction } = ebus();
      await executeInventoryAction(action, "email");
      expect(prepareAction.mock.calls[0]).toHaveLength(1);
      expect(executeAction.mock.calls[0]).toHaveLength(1);
    });
  });
});
