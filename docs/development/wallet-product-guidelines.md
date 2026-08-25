# Wallet product guidelines

These rules define what belongs in the wallet and how product decisions should be
made. Read them before changing routes, navigation, inventory, object views,
activity, settings, sharing, or external-face behavior.

## Product role

- The wallet is the end-user SmartToken application. Optimize for recognition,
  confidence, and completing a small number of personal tasks; do not expose
  console administration or operator workflows.
- The authenticated SmartToken `Wallet`, an EOA authentication/signing method,
  and the server-managed wallet session are separate concepts in copy, types,
  state, and tests.
- The API and chain are authoritative. The UI may explain, filter, and stage an
  intent, but it must not manufacture capabilities or imply an outcome that has
  not been confirmed.
- Prefer a focused end-user projection over a technically complete transport
  record. Unknown or custom data is untrusted and is not promoted to trusted UI
  merely because it arrived from an authenticated endpoint.

## Route and audience boundaries

- Authenticated routes are `/inventory`, `/inventory/[objectId]`, `/activity`,
  and `/settings`.
- Public object viewing is owned by the sibling `../viewer` application. This
  app has no anonymous object route and must not regain one.
- Authentication and recovery routes remain public and redirect an already
  authenticated user to inventory.
- Filters, sorting, and other non-sensitive state that a user may reasonably
  bookmark, share, refresh, or traverse with Back/Forward belong in the URL.
  Ephemeral disclosure, menu, modal, and unsaved input state remains local.
- Cursor values are opaque. Put one in the URL only when the canonical contract
  treats it as non-sensitive, and never interpret it as an offset or page
  number.

## Information hierarchy and disclosure

- Lead object views with the assigned face or a standard wallet-owned pass,
  followed by name, description, ownership-relevant status, and available user
  actions.
- Show action history as a readable event: action, status, affected objects,
  time, fee with unit, and transaction reference where meaningful.
- Do not render raw generated DTOs or upstream responses. Technical values such
  as hashes, nonces, controller identifiers, protocol versions, and adapted
  custom JSON may appear only in a clearly labelled secondary disclosure when
  they help the user verify or support the object.
- Secrets, signatures, authentication payloads, session fields, permit secrets,
  recovery data, and raw upstream errors never enter a disclosure.
- Destructive actions explain scope and consequence before confirmation. The
  least destructive path receives initial focus, and success is not inferred
  from navigation alone.

## External faces

- Treat every face, asset, URL, label, metadata field, and message as untrusted
  remote input even when its object is owned by the current wallet.
- Public pages never initialize the authenticated bridge.
- Inventory cards may provide only the minimized, non-privileged card context
  defined by the reviewed bridge contract. They receive no private attributes,
  custom/private fields, state or content hashes, action-request handler,
  signer/session information, or privileged capability.
- Only the authenticated detail route may grant a reviewed private-attribute or
  action-intent capability, and only after exact application ID, semantic major,
  origin, path, and ready identity verification.
- An external action request is untrusted intent. The wallet refetches availability,
  discards child-supplied authority fields, and uses the same native confirmation
  and authentication ceremony as a wallet-originated action.
- Bridge payloads are explicit allowlisted projections. Never spread a domain or
  transport object into a message envelope.

## Product state requirements

Every user-facing remote workflow explicitly handles the applicable states:

- initial/loading and incremental loading;
- empty with a useful next step;
- recoverable error with a retry path;
- expired or terminal session;
- partial or stale data without overstating freshness;
- unsupported browser or unavailable authentication method;
- user-cancelled wallet/passkey ceremony;
- pending confirmation and duplicate-submission prevention;
- confirmed success.

State-specific copy must be useful without revealing account existence,
credentials, private upstream details, or implementation terminology.

## Personalization and local persistence

- Local persistence is limited to non-sensitive presentation preferences such
  as theme and inventory view mode.
- Give each preference a namespaced key, narrow parser, safe server snapshot,
  and deterministic fallback. Treat storage as unavailable or malformed.
- Access tokens, refresh tokens, opaque session values, challenges, signatures,
  wallet details, private object attributes, and recovery state never enter Web
  Storage, IndexedDB, readable cookies, URLs, or analytics.
