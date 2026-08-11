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

function readDerLength(bytes: Uint8Array, offset: number) {
  const first = bytes[offset];
  if (first === undefined) throw new Error("Invalid passkey signature.");
  if ((first & 0x80) === 0) return { length: first, next: offset + 1 };
  const size = first & 0x7f;
  if (!size || size > 2 || offset + size >= bytes.length)
    throw new Error("Invalid passkey signature.");
  let length = 0;
  for (let index = 0; index < size; index += 1) {
    length = length * 256 + bytes[offset + 1 + index];
  }
  return { length, next: offset + 1 + size };
}

function readDerInteger(bytes: Uint8Array, offset: number) {
  if (bytes[offset] !== 0x02) throw new Error("Invalid passkey signature.");
  const { length, next } = readDerLength(bytes, offset + 1);
  const end = next + length;
  if (!length || end > bytes.length)
    throw new Error("Invalid passkey signature.");
  let value = bytes.slice(next, end);
  while (value.length > 32 && value[0] === 0) value = value.slice(1);
  if (value.length > 32) throw new Error("Invalid passkey signature.");
  const padded = new Uint8Array(32);
  padded.set(value, 32 - value.length);
  return { value: padded, next: end };
}

export function decodeP256Signature(signature: ArrayBuffer) {
  const bytes = new Uint8Array(signature);
  if (bytes[0] !== 0x30) throw new Error("Invalid passkey signature.");
  const sequence = readDerLength(bytes, 1);
  if (sequence.next + sequence.length !== bytes.length)
    throw new Error("Invalid passkey signature.");
  const r = readDerInteger(bytes, sequence.next);
  const s = readDerInteger(bytes, r.next);
  if (s.next !== bytes.length) throw new Error("Invalid passkey signature.");
  const hex = (value: Uint8Array) =>
    `0x${Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  return { signatureR: hex(r.value), signatureS: hex(s.value) };
}

export async function signActionWithPasskey(challenge: string) {
  if (!window.PublicKeyCredential)
    throw new Error("Passkeys are not supported in this browser.");
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: base64urlToBytes(challenge),
      rpId: window.location.hostname,
      userVerification: "required",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey signing was cancelled.");
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    credentialId: credential.id,
    authenticatorData: bytesToBase64url(response.authenticatorData),
    clientDataJson: bytesToBase64url(response.clientDataJSON),
    ...decodeP256Signature(response.signature),
  };
}
