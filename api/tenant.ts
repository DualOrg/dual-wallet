import type { NextRequest } from "next/server";

export interface TenantContext {
  organizationId: string;
  subdomain: string;
  host: string;
}

export const DEFAULT_ORGANIZATION_ID = "000000000000000000000001";

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
    .every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
    );
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

export function tenantFromRequest(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host =
    forwardedHost || request.headers.get("host") || request.nextUrl.host;
  return organizationIdFromHost(host);
}
