import type { PasskeyLoginVerifyIn } from "@/api/web-sdk/models/PasskeyLoginVerifyIn";
import type { PasskeyRegisterVerifyIn } from "@/api/web-sdk/models/PasskeyRegisterVerifyIn";
import type { Language } from "@/api/web-sdk/models/Language";

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown) {
  return typeof value === "string" && value.length <= 16_384
    ? value
    : undefined;
}

export function parsePasskeyLogin(
  body: Record<string, unknown>,
): PasskeyLoginVerifyIn | undefined {
  const id = text(body.id);
  const rawId = text(body.rawId);
  const response = record(body.response);
  const clientDataJSON = response && text(response.clientDataJSON);
  const authenticatorData = response && text(response.authenticatorData);
  const signature = response && text(response.signature);
  const userHandle = response && text(response.userHandle);
  if (
    !id ||
    !rawId ||
    body.type !== "public-key" ||
    !clientDataJSON ||
    !authenticatorData ||
    !signature
  ) {
    return undefined;
  }
  return {
    id,
    rawId,
    type: "public-key",
    response: { clientDataJSON, authenticatorData, signature, userHandle },
  };
}

export function parsePasskeyRegistration(
  body: Record<string, unknown>,
  organizationId: string,
  language: Language,
): PasskeyRegisterVerifyIn | undefined {
  const id = text(body.id);
  const rawId = text(body.rawId);
  const response = record(body.response);
  const clientDataJSON = response && text(response.clientDataJSON);
  const attestationObject = response && text(response.attestationObject);
  const rawTransports = response?.transports;
  const allowed = new Set(["ble", "hybrid", "internal", "nfc", "usb"]);
  const transports = Array.isArray(rawTransports)
    ? rawTransports.filter(
        (value): value is "ble" | "hybrid" | "internal" | "nfc" | "usb" =>
          typeof value === "string" && allowed.has(value),
      )
    : undefined;
  if (
    !id ||
    !rawId ||
    body.type !== "public-key" ||
    !clientDataJSON ||
    !attestationObject
  ) {
    return undefined;
  }
  return {
    id,
    rawId,
    type: "public-key",
    organizationId,
    language,
    response: { clientDataJSON, attestationObject, transports },
  };
}
