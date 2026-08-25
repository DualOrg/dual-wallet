# Dual Viewer

End-user smart object wallet viewer built with Next.js App Router. The app uses the generated `web-sdk` against `api-v3` for wallet authentication, inventory objects, wallet activity and profile settings.

## Tenant routing

An organization is resolved two ways, and the entry link wins.

### Entry link

A wallet entry link names its organization in the path:

```
https://wallet.dual.network/000000000000000000000001/login
```

`proxy.ts` accepts that prefix on any route, strips it, serves the plain route,
and keeps the ID in the `smarttoken_viewer_org` cookie. The pages and the
`/api/session/**` routes that the proxy matcher excludes all stay on the plain
paths and read the organization from that cookie. The console shows this link on
the organization overview page.

Every unauthorized route keeps the prefix in the address bar. A link from one of
them to the next resolves to a plain path, so the proxy redirects it back to
`/<organization-id>/<route>`; a reload, a bookmark, or a URL handed to somebody
else therefore stays in the same wallet. The authorized routes carry no prefix,
because their session already holds the organization.

The verification, sign-in-code and password-reset mails name the organization in
their link query instead, which is what `smarttoken/services/notifications`
already builds. `/verify`, `/otp` and `/reset-password` accept
`?organization_id=` there and move it into the path. No other route does: a link
that could set the organization anywhere could also sign a visitor out of the
wallet they are using.

The ID is therefore supplied by whoever opens the link, and it grants nothing on
its own. It chooses which organization the sign-in is made against; `api-v3`
validates the credentials inside that organization, and `establishSession`
refuses a login whose access token `org_id` claim is a different one. A session
stays bound to both the organization and the exact host, so opening a second
organization's entry link ends the first session in that browser.

The wallet cannot check the ID before sign-in, because
`GET /organizations/{organizationId}` requires a bearer token. An unknown
organization therefore surfaces as a failed sign-in rather than a rejected link.

### Host

Without an entry link, the left-most subdomain resolves through a server-owned
map to the internal organization ObjectID. The host must be a valid one either
way.

- Current wildcard mapping: `*` → `000000000000000000000001`
- Production host: `wallet.dual.network` → `*` → wildcard organization
- Tenant example: `acme.wallet.dual.network` → `acme` → wildcard organization
- Local example: `demo.localhost:3000` → `demo` → wildcard organization
- Bare `localhost` and the bare Viewer domain resolve as `*`.
- Any other valid custom domain or Cloud Run host also resolves through `*`
  unless it has an explicit mapping.

Configure the production suffix with `VIEWER_BASE_DOMAIN`. Add either an exact
host mapping such as `wallet.customer.com` or a tenant-label mapping such as
`customer` in `api/tenant.ts` as organizations are introduced. Exact hosts win
over labels, and all unknown hosts and labels fall back to `*`.

## Local development

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Open [http://demo.localhost:3000](http://demo.localhost:3000) or [http://localhost:3000](http://localhost:3000). Both currently resolve to the wildcard organization.

Registered external-face bridge origins are an explicit build-time allowlist:

```text
NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS=https://faces.dual.network
NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS=dual.dpp@1=https://faces.dual.network/dpp/v1/
```

Development also allows `http://localhost:4100` and `http://127.0.0.1:4100`. Viewer initializes the bridge only from authenticated inventory/object components; anonymous public cards receive no Viewer bridge or session data.

## User flows

- Email/password registration and login (default method)
- EOA connect/login with a one-time `personal_sign` challenge
- Passkey registration and login
- Email verification and resend
- Forgot/reset password
- Kernel smart-account inventory, object details and versioned action logs
- External face `card` views in inventory and `detail` views on object pages
- Profile/language updates and account deletion

Operator and admin surfaces are intentionally outside this app shell and can be added as a separate role-gated area later.

Advanced DPP, Trading, and NFT workflows are also separate applications rather than Viewer forks. They share API, domain, session, action-execution, object-view, and UI packages while keeping independent origins and server-held sessions. See [Dedicated application architecture](./docs/dedicated-applications.md) for the trust model and authenticated backend design.

The native external-face bridge is authenticated-only and bound to an approved
application ID, semantic major, exact origin, and URL path. It exposes a
normalized current object, invalidation, health, and Viewer-native details.
Trusted detail faces may also read the bound object's minimized attributes and
request a standard native action flow. Viewer retains the object binding,
confirmation, email/passkey/EOA signing, and execution; the iframe never
receives signatures, cookies, JWTs, or an arbitrary API proxy. The builder
guide, DPP child, and protocol live in the sibling `external-faces` project.
Viewer-specific rendering, capability grants, file ownership, verification,
and release impact are documented in
[External-face integration](./docs/external-face-integration.md).

Bridge internals are modular: `app/_lib/external-face-bridge/core/` owns the
channel and trust boundary, while `capabilities/` owns named object, attribute,
action, and Viewer-UI operations. New backend integrations add a reviewed
capability plus a Viewer-side adapter; they do not add generic HTTP access to
the iframe.

## API and session boundary

Browser code never receives API access or refresh tokens. Auth routes establish a host-only, `HttpOnly`, `SameSite=Strict` cookie whose contents are sealed and opaque to the browser. The allow-listed `/api/backend` proxy exposes only the operations the generated SDK needs.

A second cookie holds the organization an entry link chose. It carries no credential, and the session cookie stays the only thing that grants access.

There is no server-side session store. The tokens are sealed into the cookie
itself with AES-256-GCM, so a replaced container or a request that lands on a
second instance keeps the wallet signed in, and instances need no pinning.

The authenticated wallet projection distinguishes the Kernel execution account
from its authorized controller. Object ownership and inventory filtering use
the smart-account address. EOA, passkey and future session-key values are
controller authentication methods carried through the existing
prepare/sign/execute flow; controller addresses are never treated as object
owners.

Passkeys also require the smart object backend WebAuthn configuration to use a relying-party ID that is a registrable suffix of every Viewer tenant host, and to allow those tenant origins. This cannot be relaxed safely in browser code.

## Generated SDK

`api/web-sdk` is synchronized from the sibling `../web-sdk` repository:

```bash
npm run sdk:sync
```

The command records the source commit in `api/web-sdk/.source-commit`. It marks the generated artifact as vendor code because the current generator output contains strict TypeScript 5.9 errors in generated guards and duplicate barrel exports; Viewer-owned code remains strictly checked.

## Quality checks

```bash
npm run check
npm run build
npm run test:e2e
```

The Playwright suite contains deterministic mocked `api-v3` scenarios for email,
EOA and passkey authentication, verification/recovery, tenant protection,
inventory, object details, activity, settings, deletion and logout. Install the
local Chromium runtime once with `npm run test:e2e:install` when needed.

## Deployment

Viewer requires a Node.js runtime because authentication, server-held sessions,
tenant resolution and the allow-listed `api-v3` proxy run in Next.js route
handlers. A Google Cloud Storage bucket such as `dual-viewer` can host static
assets, but it cannot host this application by itself.

The Makefile deploys the standalone Docker image as the Cloud Run service
`dual-wallet`, following the same registry and region convention as Console
App. That service does not exist yet: Cloud Run cannot rename, so the first
deploy creates it alongside the old `dual-viewer`. Move the
`wallet.dual.network` domain mapping over and delete `dual-viewer` afterwards.

```bash
# YOUR_GCP_DEV_PROJECT
make wallet-dev

# YOUR_GCP_PROD_PROJECT
make wallet-prod
```

The defaults are `API_URL=https://api.dual.network`,
`VIEWER_BASE_DOMAIN=wallet.dual.network`,
`NEXT_PUBLIC_APP_URL=https://wallet.dual.network`, and
`NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS=https://faces.dual.network`.
`NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS` binds each application ID and
major version to an exact URL path prefix; the production default is
`dual.dpp@1=https://faces.dual.network/dpp/v1/`.
The bridge never transfers Viewer credentials. Public pages do not initialize
it; authenticated detail faces may receive the bound object's minimized
attributes and request a native standard action, which Viewer refetches,
confirms, signs, and executes outside the iframe.
The bridge allowlist is passed into the Docker build because Next.js embeds
public variables into the browser bundle. Override any value on the command
line when required, for example:

```bash
make wallet-prod API_URL=https://api.example.com VIEWER_BASE_DOMAIN=viewer.example.com NEXT_PUBLIC_APP_URL=https://viewer.example.com NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS=https://faces.example.com NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS=dual.dpp@1=https://faces.example.com/dpp/v1/
```

The session is a sealed cookie rather than process-local state, so instances no
longer have to be pinned to one. `MAX_INSTANCES` still defaults to 1; raise it
when you have picked a ceiling. `SESSION_SECRET` is optional for now: unset, sessions are
sealed with a key derived from a constant in the source, which is obfuscation
rather than a secret. Set it — 32 bytes of base64, `openssl rand -base64 32` —
to get real tamper-evidence back, and keep it stable across deploys, since
changing it signs every wallet out. Wildcard tenant DNS/TLS routing for `*.wallet.dual.network` remains
an infrastructure concern and is not changed by these targets.
