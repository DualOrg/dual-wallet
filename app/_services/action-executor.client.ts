import "client-only";

import { AuthBundleTypeEnum } from "@/api/web-sdk/models/AuthBundle";
import type { ActionsRequest } from "@/api/web-sdk/models/ActionsRequest";
import type { ExecuteRequest } from "@/api/web-sdk/models/ExecuteRequest";
import type { ExecuteResult } from "@/api/web-sdk/models/ExecuteResult";
import type { PrepareExecuteRequest } from "@/api/web-sdk/models/PrepareExecuteRequest";
import type { InitOverrideFunction } from "@/api/web-sdk/runtime";
import { getEbusApi, normalizeApiError } from "@/api/web-sdk-client";
import {
  faceExecutionHeaders,
  type FaceExecution,
} from "@/app/_domain/face-execution";
import type { AuthenticationMethod } from "@/app/_domain/session";
import {
  base64urlToBytes,
  signActionWithPasskey,
} from "@/app/_adapters/webauthn.client";

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

/**
 * Runs one action through the wallet's executor: prepare (the wallet's
 * current action number) + execute for email sessions, which Dual signs on
 * the custodial account's behalf; prepare + sign + execute for passkey and
 * EOA sessions. Nothing is retried: a refused execute is reported as it is.
 * With `face`, the identity is re-checked before preparing, after preparing,
 * after signing and immediately before executing, so an account change,
 * logout or teardown at any of those async boundaries stops the step before
 * anything else is sent; and every request carries the face binding, which
 * the proxy enforces server-side against the session current at THAT
 * request. Without `face` (the generic executor), no binding is sent.
 */
export async function executeInventoryAction(
  action: ActionsRequest,
  authenticationMethod: AuthenticationMethod,
  controllerAddress?: string,
  face?: FaceExecution,
): Promise<ExecuteResult> {
  const api = getEbusApi();
  const bound: InitOverrideFunction | undefined = face
    ? async ({ init }) => ({
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          ...faceExecutionHeaders(face),
        },
      })
    : undefined;
  const prepare = (prepareExecuteRequest: PrepareExecuteRequest) =>
    bound
      ? api.prepareAction({ prepareExecuteRequest }, bound)
      : api.prepareAction({ prepareExecuteRequest });
  const execute = (executeRequest: ExecuteRequest) =>
    bound
      ? api.executeAction({ executeRequest }, bound)
      : api.executeAction({ executeRequest });
  // The face's own refusal is rethrown as is, never as an API error.
  let stale: unknown;
  const live = () => {
    if (!face) return;
    try {
      face.assertLive();
    } catch (error) {
      stale = error ?? new Error("The wallet session changed.");
      throw stale;
    }
  };
  try {
    live();
    // Every account sends the wallet's CURRENT action number (POST
    // ebus/prepare, which changes and reserves nothing); a stale one is
    // refused by Dual. Preparing first is also what lets a face step's
    // identity be re-checked between reading the number and executing.
    const prepared = await prepare({ action });
    live();
    if (!Number.isSafeInteger(prepared.nonce) || prepared.nonce < 0) {
      throw new Error("The wallet's action number could not be read.");
    }

    if (authenticationMethod === "email") {
      // Custodial: Dual signs on the account's behalf, so no signature.
      return await execute({ action, nonce: prepared.nonce });
    }

    if (authenticationMethod === "passkey") {
      const assertion = await signActionWithPasskey(prepared.challenge);
      live();
      return await execute({
        action,
        nonce: prepared.nonce,
        auth: {
          type: AuthBundleTypeEnum.Webauthn,
          challenge: prepared.challenge,
          ...assertion,
        },
      });
    }

    if (!window.ethereum || !controllerAddress)
      throw new Error("No compatible browser wallet was found.");
    const signature = await window.ethereum.request({
      method: "personal_sign",
      params: [
        bytesToHex(base64urlToBytes(prepared.challenge)),
        controllerAddress,
      ],
    });
    if (typeof signature !== "string")
      throw new Error("The wallet did not return a signature.");
    live();
    return await execute({
      action,
      nonce: prepared.nonce,
      auth: {
        type: AuthBundleTypeEnum.PersonalSign,
        challenge: prepared.challenge,
        signature,
      },
    });
  } catch (error) {
    if (stale !== undefined && error === stale) throw error;
    throw await executionError(error);
  }
}
