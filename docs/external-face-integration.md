# External-face integration in the wallet

This document is the implementation guide for changing external-face behavior
inside Dual Wallet. It records the shipped host behavior, security boundary,
file ownership, tests, and cross-repository release impact.

For the wire protocol and face-authoring contract, use the canonical documents
in the sibling `external-faces` workspace:

- `external-faces/docs/bridge-protocol-v1.md`
- `external-faces/docs/security.md`
- `external-faces/docs/face-authoring-guide.md`
- `external-faces/docs/hosting-and-deployment.md`

The wallet code is authoritative for what the host actually grants. A face
manifest or publisher config cannot grant itself a capability.

## Product boundary

The wallet is a generic wallet and safe object renderer. It owns:

- public object routes and authenticated inventory;
- selection of `card`, `detail`, and `share` display variants;
- standard metadata fallback when no usable display exists;
- iframe sandboxing and aspect-ratio containers;
- the authenticated external-face bridge host;
- The wallet session, object binding, native confirmation UI, signing, action
  execution, cache invalidation, and activity rendering.

An external face owns presentation inside its iframe. It never receives the
wallet JWT, refresh token, cookie, passkey material, EOA signature, or generic
backend access. Workflows that need broad authenticated APIs belong in a
dedicated top-level application with its own BFF and host-only session; see
`docs/dedicated-applications.md`.

## Display resolution

`api-v3` resolves a source-free `ObjectDisplay` from the selected
`FaceView`. The wallet adapts that response in `app/_adapters/inventory.ts` and
renders it in `app/_components/inventory/object-visual.tsx`.

The normal selection is:

| Surface                   | Requested variant                       | Interaction                        | Authenticated bridge                                  |
| ------------------------- | --------------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| Public object page        | `card` or resolved public route variant | Display-specific                   | Never                                                 |
| Inventory grid/list card  | `card`                                  | Disabled on the card link          | Minimized current-object context only when registered |
| Authenticated object page | `detail`                                | Allowed when `interactive` is true | Registered detail capabilities                        |
| Share URL                 | `share` where requested by the API      | Public-only                        | Never                                                 |

If `detail` or `default` is absent, the object page uses the standard metadata
face. If no display is usable at all, the wallet renders name, description,
category, object ID, and the metadata image when present. A missing face must
never produce an empty object page.

The supported presentation kinds are:

- image: rendered by `next/image`;
- inline document: fetched through the fixed same-origin public-display route,
  prefixed with a restrictive CSP, and rendered in an opaque, script-free
  `srcDoc` iframe;
- external document: loaded directly from its HTTPS URL in a sandboxed iframe;
- standard metadata fallback.

Do not turn inline documents into script-capable documents. Do not use
`dangerouslySetInnerHTML` for face or object data.

## URL-backed faces and iframe policy

An external document currently uses:

```text
sandbox="allow-forms allow-same-origin allow-scripts"
referrerPolicy="no-referrer"
```

There is deliberately no popup, download, top-navigation, parent-DOM, or
wallet-session permission. The remote application must allow framing by the
wallet origin through its CSP. It runs on its own origin and is responsible for
its own content security.

`api-v3` resolves `object_id` and `variant` into the external view URL. On an
authenticated route, the wallet adds `dual_bridge=1` only when the URL matches a
registered application binding. The query flag is a mode hint, not authority;
the bridge still requires the exact-origin `MessageChannel` handshake and
application identity check.

`FaceView.aspect_ratio` is validated as a positive integer ratio such as
`5/8` or `16/10`, adapted to `ObjectPresentation.aspectRatio`, and applied to
the iframe container. The embedded application must also be responsive inside
that container. Test both narrow phones and the intended desktop/card ratio.

## Public data flow

Public pages use only the public projection:

```text
GET /public/objects?id=<id>&limit=1&include=display&display_variant=<variant>
GET /public/objects/<id>/display/<variant>
GET /public/objects/<id>/attributes?limit<=25&cursor=<cursor>
```

wallet's inline display proxy is
`/api/public/objects/[objectId]/display/[variant]`. It validates the fixed path,
caps the response, returns text rather than trusted HTML, and never attaches a
wallet session.

Public pages must not initialize the bridge or fall back to authenticated
object/attribute endpoints. An object ID is an identifier, not authorization.

## Authenticated bridge flow

The host is split by responsibility:

```text
app/_lib/external-face-bridge/
  core/          application binding, context, envelopes, channel, limits
  capabilities/  named operations and injected wallet handlers
  index.ts       public host exports
```

`app/_lib/external-face-bridge.ts` is the compatibility facade. Do not add a
second `postMessage` protocol.

The handshake is:

1. The wallet verifies the iframe URL against its build-time application registry.
2. The wallet creates a random channel ID and transfers exactly one `MessagePort`
   to the exact target origin.
3. The child answers with `dual.face.ready`, protocol version, channel ID, and
   application `{id, version}`.
4. The wallet verifies ID and semantic major, then sends the bound context through
   the private port.
5. All subsequent requests and events use that port, strict envelopes, unique
   request IDs, size limits, and rate limits.

Current host limits in `core/protocol.ts` are:

| Limit                  | Value                     |
| ---------------------- | ------------------------- |
| Ready timeout          | 5 seconds                 |
| Request size           | 64 KiB                    |
| Response size          | 512 KiB                   |
| Requests               | 30 per minute per channel |
| Remembered request IDs | 2,048                     |

The normalized context contains the selected object projection, selected view
config, locale, theme, variant, and granted operation names. Detail contexts
may also contain the available standard action names. Card contexts contain no
owner, custom data, system data, content/state hashes, or actions. Every
context omits generated DTO internals, credentials, signing material, and raw
action payloads. Revision hashes used for host-side change detection remain
internal and are never serialized to a card iframe.

## Capability matrix

The protocol-v1 operation names are:

- `bridge.ping`
- `object.current.read`
- `object.changes.subscribe`
- `object.changes.unsubscribe`
- `object.attributes.read`
- `object.action.request`
- `viewer.details.open`

Core current-object and subscription operations are composed by the host.
Additional operations are advertised only when the rendering component injects
the corresponding handler.

Inventory cards expose only `bridge.ping` and the minimized
`object.current.read`; they do not expose change subscriptions because the v1
event envelope contains a content hash. They also do not inject
private-attribute, action, or wallet-UI handlers. The authenticated detail
component injects:

- `viewer.details.open` to open the native details modal;
- `object.attributes.read` to load attributes for the already-bound object;
- `object.action.request` only when the wallet can run the native action flow.

`object.attributes.read` accepts no object ID. The handler calls the generated
SDK for the bound object and returns the minimized attribute projection.

`object.action.request` is untrusted intent. The child supplies only a supported
action name and schema-checked suggested defaults. The wallet:

1. refetches fresh object/action availability;
2. rejects child-supplied object, wallet, controller, organization, endpoint, or
   unknown input fields;
3. opens native confirmation UI;
4. executes through the existing email, passkey, or EOA path;
5. returns only `{status: "completed", action_id}`.

Never add `fetch`, `proxy`, `getToken`, `getCookie`, `executeAction`, or an
equivalent generic authority operation.

## Application registry configuration

The production default is:

```text
NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS=https://faces.dual.network
NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS=dual.dpp@1=https://faces.dual.network/dpp/v1/
```

`NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS` is the coarse exact-origin gate.
`NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS` is the authoritative
application-ID, semantic-major, origin, and path-prefix binding. Origin alone
is insufficient.

Both values are public build-time inputs embedded by Next.js. Changing them
requires rebuilding and redeploying the wallet. A trailing slash is required on the
registered path. Multiple bindings are comma-separated.

Local non-production builds additionally allow the reviewed bridge fixture at
port 4100. Do not add production wildcard origins or broad path prefixes.

## Important files

| Concern                                   | File or directory                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| API response adaptation and fallback      | `app/_adapters/inventory.ts`                                                    |
| Image/document/external iframe renderer   | `app/_components/inventory/object-visual.tsx`                                   |
| Inventory card grants                     | `app/_components/inventory/object-card.tsx`                                     |
| Detail grants, modals, and action handoff | `app/_components/inventory/object-detail.tsx`                                   |
| Attribute and action host services        | `app/_services/external-face.client.ts`                                         |
| Application/path/major registry           | `app/_lib/external-face-bridge/core/application.ts`                             |
| Object/config/action context              | `app/_lib/external-face-bridge/core/context.ts`                                 |
| MessageChannel host and limits            | `app/_lib/external-face-bridge/core/transport.ts`                               |
| Capability contracts                      | `app/_lib/external-face-bridge/capabilities/`                                   |
| Public inline-display proxy               | `app/api/public/objects/[objectId]/display/[variant]/route.ts`                  |
| Unit/integration coverage                 | `app/_lib/external-face-bridge.test.ts`, `app/_components/inventory/*.test.tsx` |
| Cross-origin E2E                          | `e2e/app.spec.ts`, `e2e/support.ts`                                             |
| Product application registry and BFF      | `api/product-face-*.ts`, `api/face-*.ts`, `app/api/faces/[slug]/`               |
| Product application bridge                | `app/_lib/external-face-bridge/core/product-*.ts`, `capabilities/programme*.ts` |
| Product application host and dialog       | `app/_components/products/`, `app/_hooks/use-product-face-host.ts`              |
| Product application E2E                   | `e2e/product-face.spec.ts`, `e2e/product-face-fixture.mjs`                      |
| Deployment registry inputs                | `.env.example`, `Makefile`, `Dockerfile`                                        |
| Shared product-face contract              | `contracts/dual-product-face-v1.json`                                           |

## Product application host (`dual-product-face-v1`)

A programme's reviewed product application ("product face") runs full-size
inside the signed-in wallet at `/products/<slug>/<task path>`. The shared
contract is `contracts/dual-product-face-v1.json` (revision 4); this section is
what the wallet implements of it. It reuses the v1 envelope, handshake and
limits above: there is no second `postMessage` protocol and no generic
fetch, proxy, token or execute operation.

### Routes and entry

- `/products` lists the programmes in the server-only registry. A programme
  entry has no selected or owned object.
- `/products/[slug]/[[...task]]`: `app/(authorized)/products/[slug]/layout.tsx`
  (Server Component) refuses an unknown slug and renders the client
  `ProductFaceHost`; the empty `[[...task]]` page only validates the task path.
  The host lives in the layout so task changes keep the same frame.
- The identity bar names the programme and publisher from the registry, never
  from the face, with Back to `/products`.
- The frame is `sandbox="allow-scripts allow-same-origin allow-forms"`,
  `allow=""`, `referrerPolicy="no-referrer"`: no popups, downloads, top
  navigation or device permissions.
- Task paths follow `contract.taskPath`. `navigation.task.update` pushes a new
  path and replaces the same path; Back/Forward and links send
  `navigation.task.restore`; a reload hands the task to the face in
  `initialize.context.task`. A path segment naming a product is a hint only.
- A signed-out visit to any protected route goes to `/login?next=<path+query>`.
  `next` must be a same-origin relative path to a protected route (single
  leading `/`, no `//`, backslash, control character or fragment, at most 512
  characters, unchanged by URL normalization). Sign-in, an already signed-in
  auth entry and verification return there; anything else falls back to
  `/inventory`. An explicit sign-out never carries a return path.

### Registry (G5)

There is no backend face-application registry, so the deployment configures a
server-only JSON array in `PRODUCT_FACE_APPLICATIONS`
(`api/product-face-binding.ts`, `api/product-face-registry.ts`). Each entry has
exactly these keys:

| Key                     | Rule                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `slug`                  | `^[a-z0-9][a-z0-9-]{1,62}$`, unique                                                                      |
| `applicationId`         | `^[a-z0-9][a-z0-9._-]{1,127}$`                                                                           |
| `version`               | exact semver (no range, no build metadata)                                                               |
| `publisher`             | `^[a-z0-9][a-z0-9._-]{1,63}$`                                                                            |
| `programmeId`           | `^[a-z0-9][a-z0-9._-]{1,63}$`                                                                            |
| `programmeName`         | plain display text, at most 80 characters                                                                |
| `origin`                | exact `https` origin with a DNS host name; loopback `http` only outside production                       |
| `path`                  | exactly `/face/<applicationId>/<version>/<64 hex of artifactHash>/`                                      |
| `artifactHash`          | `sha256:<64 lowercase hex>`                                                                              |
| `templateIds`           | 1–32 unique lowercase 24-hex Dual template IDs                                                           |
| `projectionFields`      | subset of `recordId,title,serialNumber,model,manufacturer,state`                                         |
| `canonicalRegistration` | `{stateField, lifecycleTargetField, settledStates, unconfirmedStates, endedStates}`, disjoint state sets |
| `settle` (optional)     | `{action, alias?, inputTemplate, fromStates, targetStates}`; see G6 below                                |

Invalid entries are dropped, a slug configured twice drops every entry using
it, and malformed JSON is an empty registry. `next.config.ts` derives the CSP
`frame-src` additions from the same parser, so they are exactly the registry
origins with no wildcard. The CSP is computed at build time: a new product
origin needs a rebuild, and an origin the build did not see is blocked.

### Server BFF

Every route resolves the binding from the slug, requires the active session
(terminal 401 clears the session and journal cookies), answers
`private, no-store`, and checks the mutation origin on POST.

| Route                                            | Purpose                                                                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/faces/[slug]/context`                  | verifies the pinned artifact, resets the server-side selection, returns the browser-safe binding and frame URL                                                      |
| `GET /api/faces/[slug]/units/[objectId]`         | canonical facts of an unowned unit from the public projection; template must be in the programme                                                                    |
| `POST /api/faces/[slug]/selection`               | re-reads the object with the session credential; owned by the session wallet and in the programme, else `not_owned`/`not_in_programme`; issues a fresh `context_id` |
| `GET/POST /api/faces/[slug]/operations`          | lists or moves operation journal entries (`begin`, `confirm`, `cancel`, `submit`, `record_action`)                                                                  |
| `GET /api/faces/[slug]/operations/[operationId]` | read-only status from the journal and the wallet's canonical readback; never retries, mints or executes                                                             |
| `POST /api/faces/[slug]/assertions`              | mints one assertion for one exact runtime request                                                                                                                   |
| `POST /api/faces/[slug]/settle-proposal`         | trusted runtime read of the settle proposal (G6)                                                                                                                    |

**Artifact verification.** The context route fetches `manifest.json` and
`index.html` from the pinned path without credentials, redirects refused,
with a 64 KiB/256 KiB cap and a 5 s timeout. It requires the artifact hash
recomputed from `manifest.files` — sha256 over the sorted
`<name>\t<sha256:hex>\n` lines, the emitter's algorithm — to equal the binding,
`sha256(index.html)` to equal `manifest.files["index.html"]`, and every script
and stylesheet in `index.html` to be an artifact file whose SRI equals the
manifest hash (`face.js` and `face.css` required). Any mismatch answers
`artifact_mismatch` and the browser renders no frame. The ready message's
`artifact` is checked as well but is not relied on. Residual: the browser
fetches the frame document itself, which has no SRI; trust rests on the
reviewed, immutable, content-addressed deployment.

**Trusted runtime reads.** Facts the host shows in its own confirmations come
from the bound runtime, not the face: the BFF calls
`POST <origin>/api/product-face/v1/operations` server to server with a
host-minted assertion, for `registration.settle.propose` and `case.read`
only, with a 64 KiB response cap and an 8 s timeout. Only a narrow projection
(proposal or quote) reaches the browser.

### Wallet assertion (G1 seam)

`api/face-assertion.ts` signs a compact JWS, `alg` EdDSA (Ed25519), `typ`
`dual-face-assertion+jwt`, `kid` `FACE_ASSERTION_KEY_ID`, with exactly the
claims `iss` (the exact tenant origin; a present `Origin` must equal it),
`aud` (`<applicationId>@<origin>`), `app_id`, `app_version`, `artifact`,
`publisher`, `programme`, `origin`, `sub` (wallet ID), `holder` (the session
wallet's account address, read server-side), `operation`, `op_id`, `target`,
`request_hash`, `sid_hash` (hash of a random session ID sealed into the session
cookie; tokens and the sealed cookie rotate, the ID does not), `iat`,
`exp = iat + 60` and a fresh `jti`. Nothing from the browser or face names the
holder, wallet or subject; such a key is refused.

Before every mint the server re-checks the session, the wallet, the journal
and, for product-scoped operations, that the server-side selection still
names this `context_id` and object. After logout, expiry, an account change or
a product switch nothing is minted for the old context. `registration.submit`
needs a `confirmed` journal entry for that operation and unit and moves it to
`assertion_issued` in the same response; its `request_hash` is
`sha256(canonical {object_id, operation_id})` because the wallet never sees the
runtime's evidence handle. A case write needs a `confirmed` entry whose target
(and, for a quote, the host-read quote) equals the request.

`FACE_ASSERTION_SIGNING_KEY` (PKCS8 PEM, or base64 of it) and
`FACE_ASSERTION_KEY_ID` are server-only. Absent or invalid, every mint fails
closed with `503 face_assertion_unprovisioned`. Provisioning is outside this
repository (G1): the runtime needs the public key in
`TIG_PRODUCT_FACE_WALLET_ASSERTION_KEYS` and the exact wallet tenant origins in
`TIG_PRODUCT_FACE_WALLET_ISSUERS`.

**Honest residual.** There is no runtime face session: every runtime
operation needs its own assertion. Each minted but unconsumed assertion stays
usable for its one exact request (operation, target and `request_hash`) until
first use or expiry, at most 60 seconds; the wallet cannot revoke it at the
runtime without a revocation or introspection contract. The journal caps
outstanding unexpired assertions per session at 10, a client-side bound that
is not a runtime guarantee.

### Operation journal

A sealed (AES-256-GCM with purpose-bound additional data), host-only,
`HttpOnly`, `SameSite=Strict` cookie (`__Host-dual_face_journal` in
production) bound to the session ID hash and wallet ID; any other session or
wallet reads it as empty. It holds only non-secret facts: operation ID, kind
(`registration`, `runtime`, `settle`), operation or action name, slug,
programme, object, case, phase (`confirming`, `confirmed`, `assertion_issued`,
`submitted`, `settled`, `cancelled`), settled status, proposal ID, the
host-read quote version/amount/currency, timestamps, plus the current
selection per slug and the expiry times of outstanding assertions. It never
holds an assertion, signature, token or face text. It is written before an
assertion is minted or a settle is executed, cleared on logout, and replaced
after an account change. A cookie rather than Web Storage keeps it outside
the iframe's and page scripts' reach and inside the existing session boundary.
Residual: two overlapping writes in different tabs race on the cookie; one tab
serializes its own writes, the server refuses a second mint per operation
within an instance, and the runtime's operation-ID idempotency and one-time
`jti` are the backstop.

### Application-variant bridge

`core/product-transport.ts` starts the channel only for a frame at the exact
bound origin under the pinned path. The ready `application` must be exactly
`{id, version, publisher, programme, artifact, contract}` and each value must
equal the binding (exact version); anything else closes the channel. The
initialize context is `variant: "application"`, `object_id: null`,
`object: null`, the application `{id, version, publisher}`, programme
`{id, name}`, task and capability names; no wallet ID, address, token, cookie,
assertion or DTO.

| Operation                           | Wallet behavior                                                                                                                                                                                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bridge.ping`                       | `{pong: true}`                                                                                                                                                                                                                                                               |
| `programme.context.read`            | application, programme, `selected` (`null` or `{context_id, object_id}`), `signed_in`                                                                                                                                                                                        |
| `programme.products.list`           | `listObjects` for the session wallet per programme template; minimized projection; host-held opaque `next`                                                                                                                                                                   |
| `programme.product.select`          | server-side selection (above); replaces and invalidates the previous `context_id`; the change event follows the response                                                                                                                                                     |
| `programme.product.read`            | fresh `getObjectById` for the current context; a product no longer held clears the selection                                                                                                                                                                                 |
| `programme.product.attributes.read` | the selected product's attributes as `{key, value}`                                                                                                                                                                                                                          |
| `programme.product.history.read`    | `listActionLogs` for the selected object: `{action_id, action, status, when}`, no params, signatures or fees                                                                                                                                                                 |
| `navigation.task.update`            | validated task path and optional plain-text title; mirrored to the wallet URL                                                                                                                                                                                                |
| `programme.registration.authorize`  | public unit facts; refuses `not_in_programme`, `already_registered_to_you`, `ownership_moved_state_pending`; journal `confirming`; native confirmation with canonical facts, programme, publisher and the user's own wallet; journal `confirmed`; mint `registration.submit` |
| `programme.operation.status`        | read-only status; `outcome_unknown` becomes `pending` only for an operation this live host issued                                                                                                                                                                            |
| `programme.runtime.authorize`       | reads mint directly for the selected product; case writes need native confirmation and a journal entry; quote decisions bind the host-read quote                                                                                                                             |
| `programme.product.settle.request`  | G6, below                                                                                                                                                                                                                                                                    |

Payloads reject unknown keys. Product-scoped results carry `context_id`; a
private result whose context changed while it was in flight is dropped with
`stale_context`, while an approved write may complete. One native
confirmation is pending per face (`action_in_progress`). Host events use the v1
`dual.face.event` envelope: `programme.context.changed`,
`navigation.task.restore`, `session.ended` and `operation.updated`.

Registration never maps to Dual's `claim_ownership`, which claims an object on
chain as a collectible and is not holder ownership. The application variant
offers no `object.*` operation, so `object.action.request` cannot be used, and
`claim_ownership` is refused as a settle action at every layer.

**Canonical status.** Registered requires the readback owner to equal the
session wallet's account address, the Dual state in `settledStates` and the
lifecycle target absent or equal to that state. Owner equality with a state
in `unconfirmedStates` (`Transfer pending`) is `ownership_moved_state_pending`,
never registered. Owner equality with an ended state or a disagreeing
lifecycle target is `recovery_required`. After the assertion is issued, a unit
not yet held by the wallet is `outcome_unknown`; the original operation is
kept and never re-minted. After a reload the host lists journal entries whose
authority already left the wallet, reconciles them read-only and reports
`operation.updated`.

**G6 holder settle.** The face sends only `{context_id, operation_id,
settle_operation_id}`. The host re-reads the selected product (held by the
wallet, in the programme, state in `settle.fromStates` and
`unconfirmedStates`, else `settle_not_required`), obtains the proposal itself
through the BFF, and requires it bound to this unit and original operation,
unexpired, the configured action, an input that matches `settle.inputTemplate`
exactly (same keys at every level; leaves are `{"$literal": …}` or
`{"$oneOf": "targetStates"}`, and all target-state leaves agree), a proposal
hash equal to `sha256(canonical {object_id, action, input})`, and the action
available in a fresh read. The confirmation shows the decoded field changes
from the proposal and the fresh object. The journal records the settle before
execution (`submitted`), then the existing executor runs exactly that proposal
as the holder (email execute, or passkey/EOA prepare, sign and execute). A
cancel is `not_submitted`; a lost or failed execution is `outcome_unknown` and
is never re-executed. Status stays `ownership_moved_state_pending` until the
readback shows a settled state with an agreeing lifecycle target.

**Quotes.** Before `case.quote.approve` or `case.quote.decline` the BFF reads
`case.read` itself, records the quote in the journal and the confirmation
shows quote version, provider (labelled as from the publisher), the exact
decimal amount formatted in the active locale without a float, and that no
payment is taken. The write assertion's target binds
`{case_id, quote_version, amount, currency}`; a different quote from the face
is refused with `quote_changed` and needs a fresh read and confirmation.

**Session teardown.** `SessionProvider.onSessionEnd` notifies before logout
revokes the session, on expiry and on an account change. The host sends
`session.ended`, closes the channel, removes the frame, clears the selection
and product-face queries, and resolves an open confirmation as cancelled. After
an account change the user may reopen the face for the new account.

### Local cross-origin harness

`npm run test:e2e:product-face` (`playwright.product-face.config.ts`) runs
the actual wallet (`next dev`, browsed at `http://demo.localhost:3000`, probed
at `http://127.0.0.1:3000/login`), the local fake api-v3 `e2e/mock-api.mjs` at
`127.0.0.1:4010`, and `e2e/product-face-fixture.mjs` at `localhost:4101`, which
serves the pinned artifact emitted by the Studio worker into
`e2e/fixtures/product-face/<applicationId>/<version>/<hash>/` and a labelled
fake of the runtime endpoints. Ed25519 test keys are generated per run and
never written to disk. With `MOCK_PROGRAMME_DUAL_URL` set, the fake api-v3
forwards programme-template object reads to the Studio local fake Dual
(integrated mode). Where Playwright's own Chromium build is not installed,
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` names the browser binary. The fixture is
byte-exact and excluded from formatting and linting.

## Change impact guide

### Rendering or aspect-ratio change

Update the domain adapter, `ObjectVisual`, card/detail CSS, and component tests.
Verify a real external face at phone width and its declared desktop ratio.
Confirm the standard metadata fallback still works.

### New display field or FaceView behavior

Change `api-v3` schemas and gateway bundle first, regenerate/synchronize the
web SDK, update the wallet adaptation, then update face/template authoring docs and
Console App editing if publishers need to set the field.

### New bridge operation

This is a cross-repository protocol change. Update, in one coordinated review:

1. canonical protocol and security docs in `external-faces`;
2. strict child schemas/client and tests;
3. The wallet capability module, injected handler, limits, and tests;
4. the DPP UI with capability detection and safe error states;
5. `api-v3`, SDK, or BFF routes when backend data is required.

For a service-book integration, use narrow operations such as
`service_book.entries.list` and `service_book.entry.read`; bind them to the
current object and cap pagination. Do not expose a URL or arbitrary request
options through the bridge.

### New trusted face application

Register the exact application ID, semantic major, HTTPS origin, and narrow path
prefix. Review hosting ownership, CSP, manifest, bridge implementation, and
release process before changing the wallet environment values.

## Verification

Run the smallest relevant test first, then:

```bash
npm run check
npx playwright test -g "authenticated external face"
npm run build
```

Required regression cases include public/private separation, fallback display,
wrong origin/path/application/major, malformed and unknown envelope fields,
duplicate IDs, request/response limits, rate limiting, timeouts, iframe
navigation/unmount, capability denial, object-ID injection, action
cancellation, and absence of tokens/signatures from all messages.

No unit or E2E test may call production APIs, sign a real challenge, mutate a
live object, or deploy.

## Release coordination

Before deploying an integration change, confirm:

- the face manifest identity matches its bridge-ready identity;
- the face semantic major matches wallet's application binding;
- the exact production URL is under the registered path prefix;
- api-v3 and generated SDK changes are already compatible;
- the face handles a missing optional capability without breaking rendering;
- The wallet and face deployment order is backward compatible;
- public mode still works with no authenticated bridge;
- a prior immutable face release and prior wallet revision are available for
  rollback.

Deployment, promotion, template reassignment, and live object actions are
state-changing operations and require explicit human authorization.
