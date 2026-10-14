// Routes a signed-out visitor may be returned to after signing in.
export const PROTECTED_ROUTE_PREFIXES = [
  "/inventory",
  "/activity",
  "/settings",
  "/products",
] as const;

export const RETURN_PATH_MAX_LENGTH = 512;

export function isProtectedPath(pathname: string) {
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * A `next` value is attacker-controllable. Accept only a same-origin relative
 * path plus query that names a protected wallet route: one leading slash, no
 * scheme, host, backslash, control character or fragment, and a length cap.
 */
export function safeReturnPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value || value.length > RETURN_PATH_MAX_LENGTH) return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  if (/[\\\u0000-\u001f\u007f#]/.test(value)) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value, "https://wallet.invalid");
  } catch {
    return undefined;
  }
  if (parsed.origin !== "https://wallet.invalid") return undefined;
  if (!isProtectedPath(parsed.pathname)) return undefined;
  const normalized = `${parsed.pathname}${parsed.search}`;
  return normalized === value ? normalized : undefined;
}
