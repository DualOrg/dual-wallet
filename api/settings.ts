import "server-only";

export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-smarttoken_viewer"
    : "smarttoken_viewer";

// The organization an entry link chose. proxy.ts writes it, api/tenant.ts reads
// it, and the session cookie above stays the only thing that grants access.
export const ORGANIZATION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-smarttoken_viewer_org"
    : "smarttoken_viewer_org";

export const MAX_BFF_BODY_BYTES = 1024 * 1024;
