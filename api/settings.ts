export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-smarttoken_viewer"
    : "smarttoken_viewer";

export const MAX_BFF_BODY_BYTES = 1024 * 1024;
