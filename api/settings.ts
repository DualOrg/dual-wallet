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

// The platform an entry link chose. proxy.ts writes it; the backend and display
// proxies read it to pick the gateway for objects and actions.
export const PLATFORM_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-smarttoken_viewer_platform"
    : "smarttoken_viewer_platform";

export const MAX_BFF_BODY_BYTES = 1024 * 1024;
