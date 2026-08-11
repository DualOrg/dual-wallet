# Viewer architecture

## Request boundary

1. `api/tenant.ts` extracts the subdomain from the request host and resolves it through the versioned organization ObjectID map.
2. Auth BFF routes send that server-derived ID to `api-v3`.
3. `api/server-session.ts` verifies the returned JWT `org_id`, stores API tokens server-side and sends only an opaque session credential to the browser.
4. Generated SDK clients in the browser call the allow-listed `/api/backend` proxy.
5. Protected pages consume only safe wallet fields and adapted object/activity view models.
6. Public object pages call `GET /public/objects?include=display` from the server and adapt only the `PublicSmartObject` projection plus its source-free display descriptor; they never fall back to the authenticated object response.
7. Rendered face source crosses only `/api/public/objects/{objectId}/display/{variant}`, which validates the fixed path, caps the response size, returns it as `text/plain`, and lets a sandboxed iframe execute the document in an opaque origin.
8. The adapted display URL includes both the face revision and object `content_hash`. A custom-data update therefore changes the URL, refetches the dynamic face, and avoids showing a structurally shared stale render.
9. Activity details expose the complete non-sensitive action record. Raw signatures, authentication payloads, and permit secrets remain outside the activity view model rendered by the modal.
10. Object routes open on the resolved pass face only. When no `card` face is assigned, the Viewer composes a standard pass from the metadata image, name, description, category, and object ID instead of stretching the image across the entire pass. The three-dot control opens metadata, custom data, system data, and full object hashes; authenticated template actions use a separate lower-corner control and are absent from anonymous public views.
11. Light is the default Viewer theme, including anonymous public object routes. A visitor can explicitly switch the public view to dark mode, and that selection is persisted locally for subsequent Viewer pages.

The organization ID is therefore not user-selectable. The current `*` mapping also supports bare hosts and unknown tenant labels; changing host still requires a separate host-only session.

## Route ownership

- Public user routes: `/login`, `/register`, `/verify`, `/forgot-password`, `/reset-password`, `/objects/[objectId]`
- Public object alias: `/o/[objectId]` redirects to the canonical public object URL
- Authenticated user routes: `/inventory`, `/inventory/[objectId]`, `/activity`, `/settings`
- BFF auth boundary: `/api/session/**`
- Allow-listed SDK transport: `/api/backend/**`
- Public display boundary: `/api/public/objects/[objectId]/display/[variant]`

An operator/admin interface should use a distinct authenticated layout and explicit role claims. It should not make the existing user navigation conditional on hidden role checks.
