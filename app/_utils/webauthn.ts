import type { PasskeyLoginOptionsOut } from "@/api/web-sdk/models/PasskeyLoginOptionsOut";
import type { PasskeyLoginVerifyIn } from "@/api/web-sdk/models/PasskeyLoginVerifyIn";
import type { PasskeyRegisterOptionsOut } from "@/api/web-sdk/models/PasskeyRegisterOptionsOut";

export function base64urlToBytes(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function bytesToBase64url(value: ArrayBuffer) {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createPasskey(options: PasskeyRegisterOptionsOut) {
  if (!window.PublicKeyCredential)
    throw new Error("Passkeys are not supported in this browser.");
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: base64urlToBytes(options.challenge),
      rp: options.rp,
      user: {
        id: base64urlToBytes(options.user.id),
        name: options.user.name,
        displayName: options.user.displayName,
      },
      pubKeyCredParams: options.pubKeyCredParams,
      authenticatorSelection: options.authenticatorSelection,
      timeout: options.timeout,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey creation was cancelled.");
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: bytesToBase64url(credential.rawId),
    type: "public-key" as const,
    response: {
      clientDataJSON: bytesToBase64url(response.clientDataJSON),
      attestationObject: bytesToBase64url(response.attestationObject),
      transports: response.getTransports?.(),
    },
  };
}

export async function getPasskey(
  options: PasskeyLoginOptionsOut,
): Promise<PasskeyLoginVerifyIn> {
  if (!window.PublicKeyCredential)
    throw new Error("Passkeys are not supported in this browser.");
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: base64urlToBytes(options.challenge),
      rpId: options.rpId,
      userVerification: options.userVerification,
      timeout: options.timeout,
      allowCredentials: options.allowCredentials?.map((item) => ({
        id: base64urlToBytes(item.id),
        type: item.type,
      })),
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey authentication was cancelled.");
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bytesToBase64url(credential.rawId),
    type: "public-key",
    response: {
      clientDataJSON: bytesToBase64url(response.clientDataJSON),
      authenticatorData: bytesToBase64url(response.authenticatorData),
      signature: bytesToBase64url(response.signature),
      userHandle: response.userHandle
        ? bytesToBase64url(response.userHandle)
        : undefined,
    },
  };
}
