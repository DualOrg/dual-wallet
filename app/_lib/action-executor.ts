import { AuthBundleTypeEnum } from "@/api/web-sdk/models/AuthBundle";
import type { ActionsRequest } from "@/api/web-sdk/models/ActionsRequest";
import type { ExecuteResult } from "@/api/web-sdk/models/ExecuteResult";
import { getEbusApi, normalizeApiError } from "@/api/web-sdk-client";
import type { AuthenticationMethod } from "@/app/_domain/session";
import { base64urlToBytes, signActionWithPasskey } from "@/app/_utils/webauthn";

function bytesToHex(value: Uint8Array) {
  return `0x${Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function executionError(error: unknown) {
  const normalized = await normalizeApiError(
    error,
    "The action could not be completed.",
  );
  return new Error(normalized.message);
}

export async function executeInventoryAction(
  action: ActionsRequest,
  authenticationMethod: AuthenticationMethod,
  walletAddress?: string,
): Promise<ExecuteResult> {
  const api = getEbusApi();
  try {
    if (authenticationMethod === "email") {
      return await api.executeAction({
        executeRequest: { action, nonce: 0 },
      });
    }

    const prepared = await api.prepareAction({
      prepareExecuteRequest: { action },
    });

    if (authenticationMethod === "passkey") {
      const assertion = await signActionWithPasskey(prepared.challenge);
      return await api.executeAction({
        executeRequest: {
          action,
          nonce: prepared.nonce,
          auth: {
            type: AuthBundleTypeEnum.Webauthn,
            challenge: prepared.challenge,
            ...assertion,
          },
        },
      });
    }

    if (!window.ethereum || !walletAddress)
      throw new Error("No compatible browser wallet was found.");
    const signature = await window.ethereum.request({
      method: "personal_sign",
      params: [
        bytesToHex(base64urlToBytes(prepared.challenge)),
        walletAddress,
      ],
    });
    if (typeof signature !== "string")
      throw new Error("The wallet did not return a signature.");
    return await api.executeAction({
      executeRequest: {
        action,
        nonce: prepared.nonce,
        auth: {
          type: AuthBundleTypeEnum.PersonalSign,
          challenge: prepared.challenge,
          signature,
        },
      },
    });
  } catch (error) {
    throw await executionError(error);
  }
}
