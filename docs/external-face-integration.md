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
| Deployment registry inputs                | `.env.example`, `Makefile`, `Dockerfile`                                        |

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
