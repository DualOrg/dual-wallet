# Dual Viewer

End-user smart object wallet viewer built with Next.js App Router. The app uses the generated `web-sdk` against `api-v3` for wallet authentication, inventory objects, wallet activity and profile settings.

## Tenant routing

The left-most subdomain is resolved through a server-owned map to the internal organization ObjectID. It is never accepted from a browser form or query parameter.

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
over labels, and all unknown hosts and labels fall back to `*`. Session records
remain bound to both the resolved organization ID and exact host, and the
access token `org_id` claim must match before a session is established.

## Local development

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Open [http://demo.localhost:3000](http://demo.localhost:3000) or [http://localhost:3000](http://localhost:3000). Both currently resolve to the wildcard organization.

## User flows

- Email/password registration and login (default method)
- EOA connect/login with a one-time `personal_sign` challenge
- Passkey registration and login
- Email verification and resend
- Forgot/reset password
- Wallet inventory, object details and paginated action logs
- Public object previews and share links using the API's filtered public projection
- Profile/language updates and account deletion

Operator and admin surfaces are intentionally outside this app shell and can be added as a separate role-gated area later.

## API and session boundary

Browser code never receives API access or refresh tokens. Auth routes establish an opaque, host-only, `HttpOnly`, `SameSite=Strict` cookie and keep tokens server-side. The allow-listed `/api/backend` proxy exposes only the Viewer operations needed by the generated SDK.

The included session store is process-local and fits the provided single-process standalone Docker runtime. A horizontally scaled deployment must replace it with a shared encrypted/TTL session store before adding replicas.

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
`dual-viewer`, following the same registry and region convention as Console
App:

```bash
# YOUR_GCP_DEV_PROJECT
make viewer-dev

# YOUR_GCP_PROD_PROJECT
make viewer-prod
```

The defaults are `API_URL=https://api.dual.network`,
`VIEWER_BASE_DOMAIN=wallet.dual.network` and
`NEXT_PUBLIC_APP_URL=https://wallet.dual.network`. Override any value on the
command line when required, for example:

```bash
make viewer-prod API_URL=https://api.example.com VIEWER_BASE_DOMAIN=viewer.example.com NEXT_PUBLIC_APP_URL=https://viewer.example.com
```

Deployment is capped at one Cloud Run instance while sessions use the current
process-local store. Introduce a shared session store before allowing multiple
instances. Wildcard tenant DNS/TLS routing for `*.wallet.dual.network` remains
an infrastructure concern and is not changed by these targets.
