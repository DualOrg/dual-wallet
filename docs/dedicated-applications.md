# Dedicated application architecture

## Decision

Dual Wallet remains the universal, deliberately constrained smart-object wallet. Rich vertical products are separate applications that share reviewed libraries and API contracts rather than forks of the wallet.

The product boundary is:

| Surface             | Responsibility                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Dual Wallet         | Public card rendering, metadata/details, share links, generic inventory, standard actions, isolated faces, and a fallback for every object type |
| DPP application     | Lifecycle records, certificates, service history, ownership workflows, public/private attributes, and issuer or service-provider operations     |
| Trading application | Offers, pricing, order books, settlement, transfers, balances, and trading-specific risk controls                                               |
| NFT application     | Galleries, collections, minting, traits, drops, marketplace discovery, and collection-specific navigation                                       |

Faces describe how an object is presented. Applications implement a business workflow. A face must not become an unrestricted plugin with access to the wallet session.

## Why separate applications

A universal wallet needs a small and predictable attack surface. Every additional third-party script, API permission, signing workflow, or vertical navigation rule makes that surface harder to reason about and turns every face publisher into a potential wallet application author.

Dedicated applications provide:

- an independent origin and Content Security Policy;
- a dedicated server-side session and explicit API allowlist;
- use-case-specific navigation, data models, caches, and error states;
- independent deployment and release cadence;
- a clear consent boundary for sensitive or high-value operations;
- normal JavaScript and authenticated backend access without putting credentials in face HTML.

The applications should reuse packages, not the wallet pages. Copying or forking the wallet would create incompatible login, signing, object-adapter, and security implementations.

## Current state versus target state

### Available now

- DUAL access and refresh JWTs never reach browser code. They are sealed into the session cookie and opened only on the server.
- Browser code receives only a host-only, `HttpOnly`, `SameSite=Strict` cookie it cannot read.
- The wallet exposes a small allowlisted same-origin BFF at `/api/backend/**`.
- Inline HTML faces are rendered from the public object projection and run without scripts or network access.
- HTTPS URL-backed faces can run JavaScript in a sandboxed iframe and receive resolved `object_id` and `variant` query parameters.
- Email sessions can execute standard actions through the authenticated BFF.
- Passkey and EOA sessions use `POST /ebus/prepare`, sign the canonical challenge in the browser, and submit `POST /ebus/execute`.
- Trusted external faces can use an authenticated, object-bound bridge for the
  current object, minimized detail attributes, and wallet-owned standard action
  requests. They never receive the wallet token or an arbitrary API proxy.

### Not available yet

- a trusted application registry;
- OAuth/OIDC authorization-code and token endpoints;
- a one-time launch-grant exchange between the wallet and a dedicated application;
- a backend-managed face application registry and per-application capability
  policy (the wallet currently uses exact deployment-configured bindings);
- application-scoped access or refresh tokens;
- complete session-key creation, consent, revocation, and enforcement endpoints;
- action/object/template scopes in the current session-key permission schema.

An external URL face is still not an authenticated application session. A
registered official detail face may receive the named bridge capabilities above,
but broader authenticated APIs remain a dedicated-application/BFF concern.

## Recommended deployment model

Use a separate origin and BFF for every product:

```text
wallet.dual.network     Generic Dual Wallet + the wallet BFF
dpp.dual.network        DPP web application + DPP BFF
trade.dual.network      Trading web application + Trading BFF
nft.dual.network        NFT web application + NFT BFF
auth.dual.network       Authorization service (target architecture)
api.dual.network        Canonical api-v3 services
```

Each product has its own deployment, cookie, session store, API route allowlist, CSP, telemetry, and incident boundary. A compromise of the DPP frontend must not automatically expose a Trading or wallet session.

For the full application, prefer top-level navigation from the wallet to the dedicated origin. Top-level navigation avoids third-party-cookie restrictions, gives WebAuthn a clear origin, provides usable browser history, and makes the security boundary visible to the user.

Use an iframe only for a small embedded preview or transitional integration. Do not put the entire authenticated product inside the generic object card unless the bridge and authorization model described below have been implemented.

## Shared packages

Publish reviewed, versioned packages from a common platform repository or npm registry. Applications consume package releases; they do not import sibling application source at runtime.

### `@dual/api-sdk`

Generated from `api-v3` and treated as the transport boundary.

- generated request and response types;
- API methods and error envelopes;
- contract-defined serialization;
- no browser token persistence;
- no product-specific React components.

### `@dual/domain`

Stable application-facing models and adapters.

- public and authenticated object projections;
- display descriptors;
- metadata/custom/system separation;
- attribute and activity models;
- cursor pagination primitives;
- application descriptors and capabilities once added to `api-v3`.

Generated DTOs enter here and are normalized once. Product applications should not each reinterpret `ObjectDisplay`, hashes, actions, or optional fields differently.

### `@dual/auth-browser`

Browser-only authentication ceremonies, with no token store.

- WebAuthn binary/base64url conversion;
- passkey registration and assertion helpers;
- EOA challenge signing through `personal_sign`;
- authorization-code/PKCE helpers once the authorization service exists;
- typed cancellation and unsupported-browser errors.

This package may create a PKCE verifier, invoke a passkey, or ask a wallet to sign. It must never persist an API access or refresh token.

### `@dual/bff-session`

Server-only session implementation shared by the wallet and dedicated application BFFs.

- opaque host-only session cookies;
- encrypted/shared session storage keyed by a hash of the opaque cookie;
- access-token expiry checks;
- single-flight refresh-token rotation;
- exact tenant, host, client, and audience binding;
- upstream request authorization;
- terminal-401 cleanup;
- audit-safe error normalization.

This package must have a server-only export condition so it cannot be bundled into browser JavaScript. The wallet seals its session into the cookie and keeps no server-side store, so it scales horizontally as it stands. A product that needs revocable server-side sessions has to add a shared encrypted TTL store.

### `@dual/action-executor`

The common prepare/sign/execute state machine.

- validates an action against capabilities returned by the API;
- calls `POST /ebus/prepare` for self-custodial methods;
- signs the exact returned challenge with passkey or EOA;
- submits `POST /ebus/execute` with the returned nonce and typed `AuthBundle`;
- supports the server-managed email path;
- normalizes cancellation, rejection, stale nonce, authorization, and execution errors;
- never logs challenges, signatures, permits, or auth bundles.

Provide a framework-neutral core plus small React hooks. Do not hide a browser signing prompt inside an unobservable generic `fetch` wrapper.

### `@dual/object-view`

Reusable safe presentation components.

- metadata fallback card;
- image/SVG/HTML display selection;
- details and formatted custom JSON;
- share-link generation;
- loading and error states;
- display aspect-ratio handling;
- iframe sandbox policy for public previews.

It should accept already-adapted domain data. It must not discover sessions, call arbitrary URLs, or expose credentials.

### `@dual/ui`

Shared design tokens and accessible primitives.

- theme tokens and typography;
- buttons, menus, modals, fields, cards, pagination, and alerts;
- focus management and mobile modal behavior;
- no product navigation or API logic.

### `@dual/app-launch`

Shared application discovery and launch helpers once the registry exists.

- validates registered origins and redirect URIs;
- builds public and authenticated launch requests;
- creates and verifies `state` and PKCE values;
- exposes application identity and requested capabilities;
- never accepts an arbitrary launch origin from object custom data.

## Application registry

The wallet should show **Open in DPP**, **Open Trading**, or **Open NFT** only for a server-registered application. Object or face data must not be able to invent a trusted application link.

A target registry record should contain at least:

```json
{
  "id": "dual-dpp",
  "name": "DUAL Product Passport",
  "origin": "https://dpp.dual.network",
  "launch_url": "https://dpp.dual.network/objects/{object_id}",
  "client_id": "dual-dpp-web",
  "redirect_uris": ["https://dpp.dual.network/api/auth/callback"],
  "launch_mode": "top_level",
  "object_categories": ["digital-product-passport"],
  "template_ids": [],
  "capabilities": [
    "objects:read",
    "attributes:read",
    "attributes:write",
    "certificates:read",
    "service-history:write"
  ],
  "enabled": true
}
```

Recommended assignment precedence:

1. explicit template application assignment;
2. organization + object-category assignment;
3. no dedicated application.

The resolved object response should contain a source-free application descriptor, not administrative configuration or credentials:

```json
{
  "application": {
    "id": "dual-dpp",
    "name": "DUAL Product Passport",
    "launch_href": "/applications/dual-dpp/launch?object_id=OBJECT_ID",
    "launch_mode": "top_level",
    "capabilities": ["objects:read", "attributes:read"]
  }
}
```

`launch_href` should point at a DUAL-controlled launch endpoint. That endpoint resolves the registered external origin and does not redirect to a caller-supplied URL.

## Public application launch

Public data does not need a JWT.

1. The wallet resolves the registered application for the object.
2. The user selects **Open in DPP**.
3. The wallet navigates to the registered application with `object_id` and an optional `return_to` value.
4. The application requests only public endpoints such as `GET /public/objects` and `GET /public/objects/{id}/attributes`.
5. When the user requests a private operation, the application starts its own authenticated flow.

Knowledge of an object ID is not authorization. The public API remains responsible for filtering metadata, custom data, attributes, and assets.

## Authenticated backend calls without exposing a JWT

Dedicated applications can make any required JWT-protected backend calls. The JWT belongs to the dedicated application's BFF, not to its iframe or browser JavaScript.

The recommended request path is:

```text
Browser
  -> host-only HttpOnly application cookie
  -> dedicated application BFF
  -> server-held DUAL access token
  -> explicit api-v3 endpoint allowlist
```

For example:

```text
GET https://dpp.dual.network/api/objects/OBJECT_ID/certificates
Cookie: __Host-dual-dpp-session=<opaque random value>

DPP BFF -> GET https://api.dual.network/objects/OBJECT_ID/certificates
Authorization: Bearer <server-held app/user access token>
```

The browser never sees the upstream `Authorization` header. The BFF:

- resolves the session from the opaque cookie;
- verifies exact host, application client, organization, wallet, expiry, and CSRF/origin constraints;
- validates method, path, object ID, body size, content type, and response type;
- refreshes and rotates the upstream token server-side;
- asks `api-v3` to authorize the wallet and application for the object;
- returns only the product-safe response projection;
- clears its own session on a terminal authentication failure.

The BFF is not an unrestricted reverse proxy. Each application maintains the smallest route allowlist it needs. A DPP BFF should not expose order-book administration merely because the underlying JWT could call it.

## Authentication options

### Option A: application-owned login

This can be shipped with the current API.

1. The user opens the dedicated application as a top-level page.
2. The application uses email, passkey, or EOA login through dedicated BFF routes.
3. The BFF receives API tokens, stores them server-side, and issues its own opaque cookie.
4. All application API calls go through that BFF.

Advantages:

- uses current authentication endpoints;
- each application's session is isolated;
- no credential crosses from the wallet to the application.

Tradeoff: the user may authenticate once per application.

### Option B: authorization code with PKCE

This is the recommended SSO target. It requires a DUAL authorization service and new API contracts.

1. The dedicated app generates a cryptographically random `state`, PKCE verifier, and `S256` challenge.
2. It stores verifier and state in its server-side pre-auth session.
3. It redirects the top-level browser to `auth.dual.network/authorize` with registered `client_id`, exact `redirect_uri`, requested scopes, object context, state, and PKCE challenge.
4. The authorization service reuses an existing DUAL login when available and shows consent for application, scopes, object constraints, and expiry.
5. It redirects to the application's registered callback with a single-use authorization code and state.
6. The application BFF verifies state and exchanges the code plus PKCE verifier directly with the authorization service.
7. The authorization service invalidates the code and returns application-scoped access/refresh credentials to the BFF.
8. The BFF creates an opaque application session cookie and redirects to the original object route.

The authorization code may pass through browser history, but it is short-lived, single-use, redirect-URI-bound, client-bound, and PKCE-bound. It is not an API JWT and becomes useless immediately after exchange.

Required target endpoints are conceptually:

```text
GET  /authorize
POST /oauth/token          grant_type=authorization_code or refresh_token
POST /oauth/revoke
GET  /oauth/userinfo       optional safe identity projection
```

Exact endpoint names should be added to `api-v3` only after the authorization-server boundary is agreed.

### Option C: one-time wallet launch grant

This is a smaller bridge to SSO if a full authorization server is deferred.

1. The wallet BFF creates a random, 30–60 second, single-use launch grant for a registered app, wallet, object, redirect URI, and capability set.
2. The browser is redirected to the registered application callback with the opaque grant and state.
3. The dedicated application BFF exchanges the grant server-to-server.
4. The grant is atomically consumed.
5. The application receives a scoped server-side session and sets its own opaque cookie.

The launch grant must be stored hashed and have a strict audience, exact redirect URI, object/client binding, one-time consumption, and no refresh semantics. It must not be accepted by ordinary `api-v3` endpoints.

This model still requires reviewed exchange endpoints and should converge on authorization code + PKCE rather than becoming a custom permanent protocol.

## What must never be done with JWTs

Never pass an access token or refresh token through:

- a face URL or query string;
- a URL fragment;
- iframe `postMessage`;
- HTML template data;
- React props or server-component payloads;
- `localStorage`, `sessionStorage`, or IndexedDB;
- readable cookies;
- application logs, analytics, error pages, or referrers;
- a generic `getToken` bridge method.

Even a short-lived user JWT gives publisher-controlled JavaScript the user's authority for its lifetime. Sandboxing reduces DOM capabilities; it does not make handing a bearer credential to untrusted code safe.

Do not share a parent-domain cookie such as `Domain=.dual.network`. Every application should use a different host-only `__Host-...` cookie. SSO should happen through authorization, not cross-subdomain cookie sharing.

## Object actions in dedicated applications

Backend data access and wallet authorization are separate concerns. A BFF may hold the API session, but self-custodial actions must still be signed by the wallet method selected by the user.

### Email/server-managed wallet

The application BFF submits the standard action through its allowed backend route. `api-v3` remains responsible for ownership, template action access, nonce, and policy validation.

### Passkey wallet

1. App asks its BFF to prepare a specific action.
2. BFF calls `POST /ebus/prepare` using its server-held access token.
3. Browser signs the exact returned challenge with `navigator.credentials.get()`.
4. Browser sends the WebAuthn assertion to the app BFF.
5. BFF submits the unchanged action, returned nonce, and `webauthn` auth bundle to `POST /ebus/execute`.

The passkey RP ID must be a registrable suffix that covers the dedicated origins, and every origin must be explicitly allowed by the backend. If that cannot be guaranteed, use a central DUAL signing window/origin rather than weakening WebAuthn origin validation.

### EOA wallet

1. App asks its BFF to prepare the action.
2. Browser wallet signs the exact prepared challenge using `personal_sign`.
3. BFF submits the action, nonce, challenge, and signature.

The application never asks for or handles an EOA private key.

### Confirmation policy

The application should show a native, structured confirmation containing:

- action name;
- affected object IDs;
- recipient or counterparty;
- fields being changed;
- estimated fees and units;
- application requesting the action;
- whether approval is one-time or delegated.

Face-supplied text is not an acceptable transaction confirmation because it can misrepresent the signed payload.

## Session keys and higher-frequency applications

Trading and some service workflows may need repeated actions without prompting for every operation. ERC-7579 session keys are the appropriate future primitive, not a copied wallet JWT.

The current contract already models a `session_key` auth type and basic validity, spend-limit, and allowed-target fields. It does not yet expose a complete lifecycle or sufficiently narrow product policy.

Before use in a dedicated application, add:

- create/install session-key endpoint;
- explicit user-consent payload and passkey authorization;
- list, inspect, revoke, and expire endpoints;
- application/client binding;
- organization and wallet binding;
- allowed action names;
- allowed object IDs, template IDs, or collections;
- recipient/counterparty constraints where relevant;
- token/native spend and fee ceilings;
- rate and count limits;
- `valid_after` and short `valid_until`;
- audit log entries for installation, every use, and revocation;
- an emergency revoke-all operation.

An empty `allowed_targets` currently means unrestricted and must not be the default generated by an application. Trading permissions should be narrow enough that compromise of the DPP app cannot transfer an unrelated NFT or spend trading balances.

The session private key should live in the dedicated application's protected runtime or an appropriate device-backed client store depending on the custody design. It is never a DUAL access JWT and must not be embedded in a face.

## Embedded face bridge

Some URL-backed faces, including the current BKVS DPP application, expect a parent bridge. If the wallet supports that integration, the bridge must be a narrow capability protocol—not a transport for credentials or arbitrary backend calls.

Allowed bridge concepts could include:

```json
{
  "version": 1,
  "type": "dual.face.request",
  "request_id": "RANDOM_ID",
  "operation": "get_public_object",
  "object_id": "OBJECT_ID"
}
```

and:

```json
{
  "version": 1,
  "type": "dual.face.request",
  "request_id": "RANDOM_ID",
  "operation": "request_action",
  "object_id": "OBJECT_ID",
  "action": {
    "set_attributes": {
      "id": "OBJECT_ID",
      "attributes": []
    }
  }
}
```

The wallet must:

- accept messages only from the iframe window created for that object;
- require an exact registered origin, never `*`;
- verify protocol version and every field with a strict schema;
- bind the message to the displayed object and allowed application;
- enforce message-size, timeout, and rate limits;
- expose only named operations, never arbitrary URL/method/headers;
- return public data directly or open a wallet-owned details/action UI;
- show native confirmation before any mutation or signature;
- perform the existing email/passkey/EOA workflow itself;
- return only the minimal result or typed error;
- never respond with an access token, refresh token, cookie, raw auth bundle, permit secret, or unrelated object data.

The bridge has no `fetch`, `proxy`, `getSession`, `getCookie`, or `getToken` operation. If the embedded application needs broad authenticated data and navigation, it has crossed the boundary into a dedicated top-level application and should use its own BFF.

## Iframe policy

URL-backed faces are untrusted remote applications. Before treating them as a production extension mechanism:

- register and allowlist exact origins;
- reject the wallet origin itself and arbitrary subdomains unless explicitly reviewed;
- require HTTPS;
- keep `referrerPolicy="no-referrer"`;
- omit popups, downloads, top navigation, pointer lock, camera, microphone, geolocation, and payment capabilities by default;
- use a restrictive iframe `allow` policy in addition to `sandbox`;
- keep the wallet cookies host-only and inaccessible to the external origin;
- require the remote origin to set an appropriate CSP and `frame-ancestors` policy;
- display the application identity when interaction is enabled;
- provide a clear top-level **Open application** action for workflows that outgrow the preview.

`allow-scripts allow-same-origin` lets a remote application run normally on its own origin. It must not be used for a same-origin wallet URL because same-origin script execution weakens the intended separation.

## API work required

The target architecture requires reviewed additions to `api-v3` and backend implementation.

### Application registry

- create/update/disable trusted application definitions;
- assign applications to templates or category policies;
- resolve a safe application descriptor for public and authenticated object views;
- validate exact origins and redirect URIs;
- audit registry changes.

### Authorization service

- authorization-code + PKCE issuance and exchange;
- application-scoped access and refresh credentials;
- exact audiences, scopes, organization, wallet, client, and expiry claims;
- consent records and revocation;
- refresh-token rotation and reuse detection;
- optional one-time launch grants during migration.

### Fine-grained capabilities

Scopes should describe backend authority, for example:

```text
objects:read
attributes:read
attributes:write
certificates:read
certificates:write
service-history:read
service-history:write
offers:read
offers:write
orders:place
settlement:execute
collections:read
mint:execute
transfer:execute
```

Scopes are only an outer permission boundary. Object ownership, template action access, organization policy, and action validation must still be enforced for every call.

### Delegated session keys

- installation and consent;
- object/action/recipient/spend/time constraints;
- execution with `session_key` auth bundles;
- list and revoke;
- complete auditability.

## Product-specific backend boundaries

### DPP

Typical BFF allowlist:

- read object and public/private attributes;
- set/delete owner-authorized attributes;
- read/write service-history records;
- read/attach certificates and verified documents;
- initiate ownership transfer;
- resolve issuer, manufacturer, and service-provider roles.

Certificates and service history should become explicit schemas/endpoints rather than growing an unbounded `custom` object indefinitely.

### Trading

Typical BFF allowlist:

- market data and order books;
- create/cancel offers and orders;
- balances and fee estimates;
- settlement preparation and execution;
- transfers required by settlement.

Trading needs stricter replay protection, idempotency controls, price/amount precision, slippage/expiry rules, spend ceilings, and rapid revocation. It is the strongest candidate for narrowly scoped temporary sessions.

### NFT

Typical BFF allowlist:

- collections and traits;
- public gallery data;
- mint/drop eligibility;
- marketplace listings and offers;
- transfer and settlement actions.

Collection media and metadata remain untrusted. The NFT app should reuse the display sandbox and safe URL adapters rather than rendering collection HTML directly in its trusted application DOM.

## Suggested delivery sequence

1. Keep the wallet as the universal fallback and public/share surface.
2. Add a trusted application registry and top-level **Open in application** action.
3. Extract and publish API SDK, domain adapters, action executor, UI, and server-only BFF session packages.
4. Build the DPP application with its own login/BFF using current endpoints.
5. Add authorization-code + PKCE SSO and application-scoped tokens.
6. Add explicit certificate and service-history APIs.
7. Add the narrow face bridge only for embedded public preview and native action requests.
8. Build Trading and NFT applications on the same packages.
9. Add complete delegated session-key lifecycle before enabling unattended or high-frequency actions.

## Security review checklist

Before a dedicated application is trusted:

- exact application origin and redirect URIs are registered;
- no DUAL JWT is browser-readable or passed to an iframe;
- session cookies are host-only, `HttpOnly`, `Secure`, and appropriately `SameSite`;
- BFF path/method/body/response allowlists are explicit;
- refresh rotation is atomic and server-side;
- CSRF/origin validation covers every mutation;
- API scopes and object ownership are both enforced;
- passkey RP ID and allowed origins are correct;
- all action confirmations reflect the exact payload to be signed;
- iframe and `postMessage` origins are exact and schema-validated;
- CSP and permission policies are narrow;
- secrets, signatures, permits, and auth bundles are excluded from logs;
- logout, token revocation, session-key revocation, and incident response are tested;
- public projections do not leak private attributes or organization data;
- every cursor, idempotency key, nonce, and expiry is handled according to the API contract.
