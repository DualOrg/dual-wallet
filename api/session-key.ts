// The session sealing key, read from SESSION_SECRET in every environment. It is
// a plain module (not server-only) so the request proxy can refuse session
// routes before they run.
//
// There is no fallback key. Without a valid key nothing is sealed or opened,
// and the session routes and the BFF answer 503 session_unavailable. Local
// runs and tests pass an explicit, ephemeral key: jest.setup.js and the e2e
// configs generate one per run, and a developer runs
// SESSION_SECRET="$(openssl rand -base64 32)" npm run dev.

export const SESSION_UNAVAILABLE_CODE = "session_unavailable";
export const SESSION_UNAVAILABLE_MESSAGE =
  "Sign-in is unavailable on this wallet right now: it has no valid session key configured. Nothing was signed in or changed.";

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** The 32-byte key from SESSION_SECRET (base64), or undefined when missing or invalid. */
export function sessionKeyFromEnv(
  secret: string | undefined = process.env.SESSION_SECRET,
): Buffer | undefined {
  const value = secret?.trim();
  if (!value || !BASE64.test(value)) return undefined;
  const key = Buffer.from(value, "base64");
  return key.length === 32 ? key : undefined;
}

/** Why the key is unusable, for the operator log; never the key itself. */
export function sessionKeyProblem(
  secret: string | undefined = process.env.SESSION_SECRET,
): "missing" | "invalid" | undefined {
  if (!secret?.trim()) return "missing";
  return sessionKeyFromEnv(secret) ? undefined : "invalid";
}
