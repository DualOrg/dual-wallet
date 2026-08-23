import "client-only";

import { requestJson } from "@/app/_utils/client-api";

export function verifyAccount(input: {
  code: string;
  email?: string;
  organization_id?: string;
}) {
  return requestJson<{ ok: boolean }>("/api/session/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function requestVerificationCode() {
  return requestJson<{ ok: boolean }>("/api/session/verification-code", {
    method: "POST",
    body: "{}",
  });
}

export function requestPasswordReset(email: string) {
  return requestJson<{ ok: boolean }>("/api/session/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function setNewPassword(input: { token: string; password: string }) {
  return requestJson<{ ok: boolean }>("/api/session/reset-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
