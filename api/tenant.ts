import "server-only";

import type { NextRequest } from "next/server";

import { ORGANIZATION_COOKIE_NAME } from "@/api/settings";

export interface TenantContext {
  organizationId: string;
  subdomain: string;
  host: string;
}

// The organization a request falls back to when no entry link named one. It is
// deployment configuration, not a constant: this repository belongs to no single
// tenant. Unset, host resolution yields nothing and the BFF answers
// tenantRequired, which is the honest failure for a wallet that was never told
// whose it is.
export const DEFAULT_ORGANIZATION_ID =
  process.env.DEFAULT_ORGANIZATION_ID ?? "";

// Versioned deployment mapping. Exact hosts take precedence over tenant labels,
// and both take precedence over the wildcard. Add either form when a custom
// domain or subdomain gets a dedicated organization:
//
//   "wallet.customer.com": "organization-object-id",
//   "customer": "organization-object-id",
//
// Every valid, unmapped host uses the current product default.
const ORGANIZATION_IDS_BY_TENANT_KEY: Readonly<Record<string, string>> = {
  "*": DEFAULT_ORGANIZATION_ID,
};

function normalizeHost(value: string) {
  const host = value.split(",", 1)[0].trim().toLowerCase();
  if (host === "::1") return host;
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    if (end > 0) return host.slice(1, end);
  }
  return host.replace(/:\d+$/, "");
}

export function organizationIdForSubdomain(subdomain?: string) {
  const key = subdomain?.trim().toLowerCase() || "*";
  return (
    ORGANIZATION_IDS_BY_TENANT_KEY[key] ?? ORGANIZATION_IDS_BY_TENANT_KEY["*"]
  );
}

function organizationIdForHost(host: string, subdomain: string) {
  return (
    ORGANIZATION_IDS_BY_TENANT_KEY[host] ??
    organizationIdForSubdomain(subdomain)
  );
}

function isValidHost(host: string) {
  if (["localhost", "127.0.0.1", "::1"].includes(host)) return true;
  if (host.length > 253) return false;
  return host
    .split(".")
    .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

export function organizationIdFromHost(
  rawHost: string,
  baseDomain = process.env.VIEWER_BASE_DOMAIN,
): TenantContext | undefined {
  const host = normalizeHost(rawHost);
  if (!host || !isValidHost(host)) return undefined;

  let subdomain = "*";
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    if (host.endsWith(".localhost")) {
      subdomain = host.slice(0, -".localhost".length).split(".", 1)[0];
    } else if (baseDomain) {
      const base = normalizeHost(baseDomain).replace(/^\./, "");
      if (host === base) {
        subdomain = "*";
      } else {
        const suffix = `.${base}`;
        subdomain = host.endsWith(suffix)
          ? host.slice(0, -suffix.length).split(".", 1)[0]
          : host.split(".").length >= 3
            ? host.split(".", 1)[0]
            : "*";
      }
    } else {
      const labels = host.split(".");
      if (labels.length >= 3) subdomain = labels[0];
    }
  }

  if (
    subdomain !== "*" &&
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)
  ) {
    return undefined;
  }

  const organizationId = organizationIdForHost(host, subdomain);
  if (!organizationId) return undefined;
  return { organizationId, subdomain, host };
}

// An entry link names its organization in the path, and proxy.ts leaves that ID
// in a cookie. The ID is therefore supplied by whoever opens the link. It
// chooses which organization the sign-in is made against; it grants nothing on
// its own. api-v3 checks the credentials inside that organization, and
// establishSession refuses a login whose JWT org_id is a different one.
const ORGANIZATION_ID = /^[0-9a-f]{24}$/i;

export function chosenOrganizationId(value?: string) {
  return value && ORGANIZATION_ID.test(value) ? value.toLowerCase() : undefined;
}

export function tenantFromRequest(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host =
    forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const tenant = organizationIdFromHost(host);
  if (!tenant) return undefined;
  // The host still has to be a valid one, and it stays the host the session is
  // bound to. Only the organization comes from the link.
  const chosen = chosenOrganizationId(
    request.cookies.get(ORGANIZATION_COOKIE_NAME)?.value,
  );
  return chosen ? { ...tenant, organizationId: chosen } : tenant;
}
