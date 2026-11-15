import "server-only";
import type { NextRequest } from "next/server";
import { PLATFORM_COOKIE_NAME } from "@/api/settings";

export type Platform = "production" | "sandbox";

// An entry link from the console names the platform: /<organization-id>/login?platform=sandbox.
export const PLATFORM_PARAM = "platform";

const PRODUCTION_API_URL = "https://api.dual.network";

export const productionApiUrl = () =>
  (process.env.API_URL || PRODUCTION_API_URL).replace(/\/+$/, "");

/**
 * The sandbox gateway origin, or undefined when SANDBOX_API_URL is absent,
 * malformed, carries credentials/query/fragment, or names the production origin.
 */
export function sandboxApiUrl(
  configured = process.env.SANDBOX_API_URL,
): string | undefined {
  if (!configured?.trim()) return undefined;
  try {
    const url = new URL(configured.trim());
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.origin === new URL(productionApiUrl()).origin
    ) {
      return undefined;
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

/** A sandbox selection without a configured sandbox gateway is production. */
export const resolvePlatform = (value: unknown): Platform =>
  value === "sandbox" && sandboxApiUrl() ? "sandbox" : "production";

export const requestPlatform = (request: NextRequest): Platform =>
  resolvePlatform(request.cookies.get(PLATFORM_COOKIE_NAME)?.value);

// Objects, their displays and actions belong to one platform. The wallet
// account, its session and the organization branding are shared, and only the
// production gateway serves them.
const PROCESSING_PATH = /^\/*(objects|ebus|public\/objects)(\/|$)/;

export function apiBaseUrl(path: string, platform: Platform): string {
  if (platform === "sandbox" && PROCESSING_PATH.test(path)) {
    const sandbox = sandboxApiUrl();
    if (sandbox) return sandbox;
  }
  return productionApiUrl();
}
