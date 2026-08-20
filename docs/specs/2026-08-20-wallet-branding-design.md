# Wallet branding contract

- Date: 2026-08-20
- Status: approved design, not yet implemented
- Repositories touched: `api-v3`, `smarttoken`, `web-sdk`, `wallet`

## Problem

A tenant wallet renders the DUAL palette and wordmark on every surface,
including the anonymous ones. Login, registration, password reset and email
verification all happen before a session exists, so the wallet cannot read any
authenticated organization data at the moment it most needs to look like the
tenant.

Branding must therefore be readable anonymously, keyed by something the wallet
already knows before login, and must never be load-bearing for authentication.

## Non-goals

- Per-tenant typography, radius or shadow. Fonts require either a self-hosted
  allowlist or a remote font host, which conflicts with the wallet CSP.
- Per-tenant auth-story copy. The eyebrow, headline and supporting text in
  `app/_components/auth/auth-shell.tsx` stay `next-intl` translations.
- Per-tenant enabled auth methods. Method availability is an authorization
  concern, not a presentation one.
- Replacing the host to organization map in `api/tenant.ts`. Tenant onboarding
  stays a wallet deploy for now.

## Decisions

1. **Keyed by `organizationId`.** The wallet already resolves host to
   organization server-side in `api/tenant.ts`, so no host resolution is added
   to the API.
2. **Payload carries display name, logos, favicon, colour overrides, and legal
   and support links.**
3. **Dedicated `PUT`**, not a field folded into `OrganizationUpdate`, so the
   `Organization` schema stays lean and branding has its own permission
   surface.

## Contract (`api-v3`)

Two paths. The public read lives under the existing `/public/**` prefix because
the gateway authorizes per path and method, and every other anonymous read in
the contract already follows that convention.

| Path                                              | Method | Security                      | Source file                                                                |
| ------------------------------------------------- | ------ | ----------------------------- | -------------------------------------------------------------------------- |
| `/public/organizations/{organizationId}/branding` | `GET`  | `security: []`                | `routes/organizations/public/organizations@{organizationId}@branding.yaml` |
| `/organizations/{organizationId}/branding`        | `PUT`  | `bearer-auth`, `api-key-auth` | `routes/organizations/organizations@{organizationId}@branding.yaml`        |

`operationId`: `GetOrganizationBrandingPublic` and `SetOrganizationBranding`.

Both paths are registered in `api.yaml`, the public one in the `/public/**`
block and the write one in the organizations block.

### `schemas/organizations/branding.yaml` (read)

```yaml
type: object
description: Public presentation settings applied to a tenant's wallet surfaces.
required:
  - name
properties:
  name:
    type: string
    maxLength: 64
    description: >
      Display name shown beside the logo. Falls back to Organization.name when
      the tenant has not set a distinct one, so this field is always populated.
  logo_url:
    type: string
    format: uri
    description: Resolved public URL of the light-theme logo.
  logo_dark_url:
    type: string
    format: uri
  favicon_url:
    type: string
    format: uri
  colors:
    $ref: "./branding-colors.yaml"
  colors_dark:
    $ref: "./branding-colors.yaml"
  terms_url:
    type: string
    format: uri
    pattern: "^https://"
  privacy_url:
    type: string
    format: uri
    pattern: "^https://"
  support_url:
    type: string
    format: uri
    pattern: "^https://"
  when_modified:
    type: string
    format: date-time
```

Only these fields are returned. The public projection never exposes members,
roles, `fqdn`, `owner_id`, or `Asset` internals such as `key`, `hash` and
`is_public`.

### `schemas/organizations/branding-colors.yaml`

```yaml
type: object
description: Overrides for the wallet design tokens. Every key is optional.
properties:
  brand:
    type: string
    pattern: "^#[0-9a-fA-F]{6}$"
  brand_strong:
    type: string
    pattern: "^#[0-9a-fA-F]{6}$"
  brand_soft:
    type: string
    pattern: "^#[0-9a-fA-F]{6}$"
  action_primary:
    type: string
    pattern: "^#[0-9a-fA-F]{6}$"
  action_primary_hover:
    type: string
    pattern: "^#[0-9a-fA-F]{6}$"
  on_action_primary:
    type: string
    pattern: "^#[0-9a-fA-F]{6}$"
```

The key set is fixed and enumerated. It is deliberately not a free
`map[string]string` of CSS variable names: an open map rendered into a
stylesheet on an anonymous page is a CSS injection surface.

The six keys map one-to-one onto tokens that already exist in
`app/globals.css`, so no new CSS is introduced.

### `schemas/organizations/branding-update.yaml` (write)

Identical to the read schema except that the three asset fields are ids rather
than URLs:

```yaml
logo_asset_id:
  type: string
logo_dark_asset_id:
  type: string
favicon_asset_id:
  type: string
```

`when_modified` is server-owned and absent from the write payload.

The backend resolves each id through the storage service and rejects the
request with `400` unless the asset belongs to the same organization and has
`is_public: true`. Accepting a raw URL here would let any operator place an
externally hosted image on the tenant login page.

`PUT` is a full replacement: omitted fields are cleared, not merged. It returns
`200` with the resolved `Branding` body.

> Deviation, accepted: the sibling `PATCH /organizations/{organizationId}`
> returns `responses/empty.yaml`. Returning the resolved body here saves
> Console App a round trip to display the asset URLs it just wrote.

### Errors

- `400` for a malformed colour, an oversized `name`, an unknown asset id, or an
  asset that is not public and org-owned.
- `404` from the public `GET` when the organization does not exist. An
  organization that exists but has never been branded returns `200` carrying
  only `name`, resolved from `Organization.name`.
- `500` via the shared internal error response.

### Gateway exposure (`smarttoken`)

A path in OpenAPI is not reachable through the public gateway. Add to
`smarttoken/etc/{dev,cloud,prod}/gateway-schema.yaml`:

```yaml
- path: public/organizations/:organizationId/branding
  method: GET
  auth: []
  resource: organizations.public.read
- path: "/organizations/:organizationId/branding"
  method: PUT
  auth:
    - jwt
    - api-key
  resource: organizations.branding.update
```

The write entry mirrors the existing `PATCH /organizations/:organizationId`
entry, which uses `jwt` and `api-key`. The `organizations.branding.update`
resource follows the `organizations.members.update` naming already in the file
and must be granted to whichever roles may edit an organization.

## Wallet integration

### Fetching

New server-only module `api/branding.ts`:

- `getBranding(organizationId)` calls
  `${API_URL}/public/organizations/${organizationId}/branding` with
  `next: { revalidate: 300 }`.
- Returns `null` on any non-`200`, network failure, or body that fails a shape
  check. It never throws.

### Tenant resolution in the layout

`tenantFromRequest` in `api/tenant.ts` takes a `NextRequest` and is only usable
from route handlers. Add a sibling that reads the same two headers from the
`next/headers` store so `app/layout.tsx` can resolve the tenant:

```ts
export function tenantFromHeaders(h: Headers) {
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  return organizationIdFromHost(host);
}
```

Both helpers delegate to the existing `organizationIdFromHost`, so the host
validation and the wildcard fallback stay in one place.

Reading `headers()` in the root layout opts the tree out of static rendering.
The wallet is already dynamic because of the session cookie, so this costs
nothing in practice.

### Applying colours

`app/layout.tsx` renders a single `<style>` element into the document head:

<!-- prettier-ignore -->
```css
:root{--brand:#0a5fd4;--action-primary:#0a5fd4}
.dark{--brand:#6ba8ff}
```

Serialization rules:

- CSS variable names come from a hardcoded map in the wallet
  (`{ brand: "--brand", action_primary: "--action-primary", ... }`). A key the
  wallet does not know is dropped.
- Each value is re-tested against `/^#[0-9a-f]{6}$/i` in the wallet even though
  the API validates it. A value that fails is dropped, not emitted.
- `colors` writes the `:root` block, `colors_dark` writes `.dark`. An absent
  block is omitted entirely, leaving the defaults in `app/globals.css`.

Because this is server-rendered into the first HTML response, there is no
client fetch and no flash of the default palette.

### Applying name, logo and favicon

- `app/_components/design-system/brand.tsx` takes `name` and `logoUrl` as
  props instead of the hardcoded `/favicon.svg` and `t("brand")`. It falls back
  to the current values when either prop is absent. `logo_dark_url` is rendered
  via a second `<Image>` toggled by the existing `.dark` class rather than by
  reading theme state in JS, so it survives server rendering.
- `generateMetadata` in `app/layout.tsx` uses `favicon_url` for `icons.icon`
  and `name` for the title template when present.

### Legal and support links

The wallet has no footer today. Add a minimal one to `AuthShell` only, rendering
whichever of `terms_url`, `privacy_url` and `support_url` are present. When none
are present the footer is not rendered at all. This is where the links matter,
because registration is the consent moment.

The authenticated shell reads the same public endpoint. It is the same data,
already cached, and the organization is already known from the host, so no
authenticated variant of the endpoint is needed.

## Security

- The endpoint is anonymous and returns only presentation data. It leaks the
  existence and display name of an organization by id, which is already
  implied by the tenant's own hostname.
- Colour values are constrained by a fixed key set and a hex pattern at the
  contract boundary and again at the render boundary.
- Logo, dark logo and favicon are org-owned public storage assets resolved
  server-side. Arbitrary external URLs are not accepted.
- `terms_url`, `privacy_url` and `support_url` are constrained to `https://`
  by schema pattern, because `format: uri` alone would admit `javascript:` and
  `data:`. They render with `rel="noopener noreferrer"`.

## Caching and invalidation

The public response carries `Cache-Control: public, max-age=300`, matched by
the wallet's `revalidate: 300`. A branding change is therefore visible within
five minutes. No explicit purge mechanism; if immediate propagation is ever
needed, that is a follow-up.

## Failure behavior

Branding is never load-bearing. Endpoint unavailable, `404`, or an unusable
payload all collapse to `null`, and the wallet renders exactly as it does
today. Authentication must not depend on a cosmetic service.

## Implementation order

Contract-first, per `docs/codebase-change-flow.md`:

1. `api-v3`: schemas, routes, `api.yaml`; then `make lint` and `make bundle`.
2. `make -C ../smarttoken api-gen` and `make sdk` in `api-v3`; review the
   generated diffs before writing any handler.
3. `smarttoken`: storage model, handlers, asset ownership validation, gateway
   schema entries for all three environments.
4. `wallet`: `api/branding.ts`, `tenantFromHeaders`, layout wiring, `Brand`
   props, auth footer.
5. Console App: branding form. Out of scope for this spec.

## Checks

- `api-v3`: `make lint` and `make bundle` both clean.
- `smarttoken`: a handler test asserting that a `PUT` referencing an asset from
  another organization, or a non-public asset, is rejected with `400`.
- `wallet`: one unit test on the token to CSS serializer, asserting that
  `red`, `#fff`, `x;}body{display:none`, and an unknown key are all dropped
  while a valid `#0a5fd4` is emitted; and one on `getBranding` returning `null`
  for a non-`200` response.

## Deferred

- Typography and radius overrides.
- Tenant-authored auth-story copy.
- Moving host to organization resolution out of `api/tenant.ts` and into the
  API via `Organization.fqdn`.
- Cache purge on write.
