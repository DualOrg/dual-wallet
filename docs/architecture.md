# Viewer architecture

## Request boundary

1. `api/tenant.ts` extracts the subdomain from the request host and resolves it through the versioned organization ObjectID map.
2. Auth BFF routes send that server-derived ID to `api-v3`.
3. `api/server-session.ts` verifies the returned JWT `org_id`, stores API tokens server-side and sends only an opaque session credential to the browser.
4. Generated SDK clients in the browser call the allow-listed `/api/backend` proxy.
5. Protected pages consume only safe wallet fields and adapted object/activity view models. The wallet domain keeps the canonical Kernel execution account (`wallet.account.address`), its authorized controller and custody, and the Kernel deployment recipe as separate concepts. Inventory ownership uses only the execution-account address; an EOA controller address is used only by the corresponding signing ceremony.
6. Public object pages call `GET /public/objects?include=display` from the server and adapt only the `PublicSmartObject` projection plus its source-free display descriptor; they never fall back to the authenticated object response.
7. Inline rendered face source crosses only `/api/public/objects/{objectId}/display/{variant}`, which validates the fixed path, caps the response size, returns it as `text/plain`, and lets a script-free sandboxed iframe display the document in an opaque origin. An HTTPS `views[].url` is kept as an external-document descriptor and loaded directly in a separate iframe with scripts, forms, and the remote application's own origin enabled. The external frame respects its declared `aspect_ratio` in inventory and full object views and receives no Viewer session token, referrer, popup, navigation, or parent-DOM capability. Authenticated components initialize the native bridge only when `NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS` binds the ready application ID/major to that exact origin and path. Public object pages never initialize it.
8. The adapted display URL includes both the face revision and object `content_hash`. A custom-data update therefore changes the URL, refetches the dynamic face, and avoids showing a structurally shared stale render.
9. Activity details expose the complete non-sensitive unified action record. Both immutable V1 history and new V2 logs use `account`, `controller`, `auth.type`, and `version`; the UI labels the identities as Account and Controller and marks the version without recalculating historical hashes. Raw signatures, authentication payloads, and permit secrets remain outside the activity view model rendered by the modal.
10. Object routes open on the resolved pass face only. When no `card` face is assigned, the Viewer composes a standard pass from the metadata image, name, description, category, and object ID instead of stretching the image across the entire pass. The three-dot control opens straightforward metadata, system, and full object-information fields plus custom data as formatted JSON; authenticated template actions use a separate lower-corner control and are absent from anonymous public views.
11. Light is the default Viewer theme, including anonymous public object routes. A visitor can explicitly switch the public view to dark mode, and that selection is persisted locally for subsequent Viewer pages.
12. The passkey login client requests options with POST to mirror api-v3. The Viewer BFF also accepts GET on the login-options route for direct navigation and cached clients; registration options remain GET. All option responses are private and non-cacheable.
13. Inventory and anonymous public object requests resolve the `card` display variant. Opening an inventory object makes a separate authenticated request for `detail`; when the face has no `detail` or `default` view, standard metadata remains the fallback.
14. The authenticated external-face bridge uses an exact-origin bootstrap followed by a transferred `MessagePort`, strict envelopes, size/rate/duplicate-ID controls, and application identity verification. Its Viewer implementation is split into `core/` (protocol, application binding, context, transport, validation, errors) and `capabilities/` (object, attributes, actions, and Viewer UI); the compatibility facade remains `app/_lib/external-face-bridge.ts`. Inventory cards receive current-object/subscription capability only. Authenticated detail may read the bound object's minimized attributes and request a standard action intent. Viewer refetches fresh availability, rejects child object IDs/unknown defaults, opens native confirmation, executes through email/passkey/EOA, and returns only status/action ID. The normalized object excludes `system`, generated transport DTOs, credentials, signatures, cookies, and signing material; arbitrary `execute_action` and HTTP proxy operations are denied. A future integration such as a service-book API adds a capability module and injected handler without changing the transport; no such operation is advertised until the canonical endpoint exists.

The organization ID is therefore not user-selectable. The current `*` mapping also supports bare hosts and unknown tenant labels; changing host still requires a separate host-only session.

## Route ownership

- Public user routes: `/login`, `/register`, `/verify`, `/forgot-password`, `/reset-password`, `/objects/[objectId]`
- Public object alias: `/o/[objectId]` redirects to the canonical public object URL
- Authenticated user routes: `/inventory`, `/inventory/[objectId]`, `/activity`, `/settings`
- BFF auth boundary: `/api/session/**`
- Allow-listed SDK transport: `/api/backend/**`
- Public display boundary: `/api/public/objects/[objectId]/display/[variant]`

An operator/admin interface should use a distinct authenticated layout and explicit role claims. It should not make the existing user navigation conditional on hidden role checks.

Rich DPP, Trading, and NFT workflows belong in separately deployed applications with their own BFF sessions. Viewer may render their public URL-backed preview, but it never sends its wallet JWT to the iframe. The complete target architecture, package boundaries, authorization-code flow, backend requirements, action signing, session keys, and optional parent bridge are documented in [Dedicated application architecture](./dedicated-applications.md).
