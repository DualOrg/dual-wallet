# Viewer architecture

## Request boundary

1. `api/tenant.ts` extracts the subdomain from the request host and resolves it through the versioned organization ObjectID map.
2. Auth BFF routes send that server-derived ID to `api-v3`.
3. `api/server-session.ts` verifies the returned JWT `org_id`, stores API tokens server-side and sends only an opaque session credential to the browser.
4. Generated SDK clients in the browser call the allow-listed `/api/backend` proxy.
5. Protected pages consume only safe wallet fields and adapted object/activity view models.
6. Public object pages call `GET /public/objects?include=display` from the server and adapt only the `PublicSmartObject` projection plus its source-free display descriptor; they never fall back to the authenticated object response.
7. Rendered face source crosses only `/api/public/objects/{objectId}/display/{variant}`, which validates the fixed path, caps the response size, returns it as `text/plain`, and lets a sandboxed iframe execute the document in an opaque origin.

The organization ID is therefore not user-selectable. The current `*` mapping also supports bare hosts and unknown tenant labels; changing host still requires a separate host-only session.

## Route ownership

- Public user routes: `/login`, `/register`, `/verify`, `/forgot-password`, `/reset-password`, `/objects/[objectId]`
- Public object alias: `/o/[objectId]` redirects to the canonical public object URL
- Authenticated user routes: `/inventory`, `/inventory/[objectId]`, `/activity`, `/settings`
- BFF auth boundary: `/api/session/**`
- Allow-listed SDK transport: `/api/backend/**`
- Public display boundary: `/api/public/objects/[objectId]/display/[variant]`

An operator/admin interface should use a distinct authenticated layout and explicit role claims. It should not make the existing user navigation conditional on hidden role checks.
