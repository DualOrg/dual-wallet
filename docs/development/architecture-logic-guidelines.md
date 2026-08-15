# Architecture and logic guidelines

These rules keep transport details, product rules, browser behavior, and React
rendering independently testable.

## Dependency model

Runtime calls flow from presentation through focused orchestration to a
transport boundary, while domain types and rules remain independent:

```text
pages/components -> hooks/use cases -> domain
                         |
                         v
                 adapters/services -> generated SDK or BFF
```

- `api/web-sdk/` is generated transport code and is never hand-edited.
- `app/_domain/` contains Viewer-owned models, value semantics, invariants,
  normalized errors, and explicit view/workflow states. It imports no React,
  Next.js, generated SDK, SDK client, browser API, or route-handler code.
- `app/_adapters/` is the generated-DTO boundary. Adapters may import generated
  DTO types and domain types; they return stable domain projections and perform
  no rendering or navigation.
- `app/_services/` owns Viewer use cases and transport orchestration that do not
  belong to a React hook. Separate server-only and browser-safe entry points.
- `app/_hooks/` owns React Query and browser workflow composition. Hooks consume
  services and domain models, not generated DTOs.
- `app/_lib/` is reserved for reviewed protocol or integration modules such as
  the external-face bridge. It is not a catch-all for feature business logic.
- Components and pages compose domain models, hooks, and design-system
  primitives. They do not instantiate SDK APIs, adapt DTOs, normalize upstream
  errors, or construct backend payloads.

Enforce these boundaries with ESLint import restrictions. Tests may import a
generated DTO to construct adapter fixtures, but presentation tests should use
domain fixtures.

## Server and browser boundaries

- Server session, tenant resolution, upstream origins, credentials, and
  token-bearing clients live in modules marked `import "server-only"`.
- Browser-only integrations use explicit client entry points and never receive
  a token-bearing object or server configuration through props or context.
- A Server Component calls the server data-access/service layer directly; it
  does not make an HTTP request to Viewer's own route handler.
- Browser code calls only same-origin, allowlisted BFF or dedicated session
  endpoints through a browser-safe service. UI modules do not know the upstream
  API origin.
- Data passed across the Server/Client Component boundary is a minimal,
  serializable domain projection. Never pass an SDK instance, error response,
  class instance, secret, or broad session record.

## Domain and transport modeling

- Use narrow unions for product states and branded or validated values where
  mixing IDs, addresses, hashes, cursors, or units could authorize the wrong
  operation.
- Preserve exact wire values when conversion may lose precision. Dates are
  normalized once, decimal/fee strings keep their exact representation, and
  chain quantities use `bigint` or a reviewed Viem-safe type.
- Optional transport fields become deliberate domain states: absent, unknown,
  unsupported, or not applicable. Do not spread OpenAPI optionality through the
  UI.
- Unknown custom data remains an opaque untrusted value until a focused parser
  validates the exact projection a feature needs.
- Never compensate for a contract mismatch with aliases, guessed defaults, or a
  second handwritten transport model. Fix the canonical contract and regenerate.

## Workflow and concurrency modeling

- Model mutually exclusive async stages with a discriminated union or reducer,
  not several booleans that can form impossible combinations.
- A workflow state records only what its current stage needs. Challenges,
  assertions, signatures, recovery tokens, and private payloads are not retained
  after their immediate request boundary.
- Prevent duplicate mutation submission and define the concurrency policy:
  single-flight, latest-wins with cancellation, queued, or explicitly rejected.
- Revalidate authorization-sensitive facts immediately before execution. Cached
  UI availability is never authority.
- Optimistic updates require a safe rollback and idempotent, well-understood
  backend semantics. Authentication, signing, deletion, and irreversible object
  actions are not optimistic.
- An upstream success response is adapted before cache or session changes.
  Navigation does not stand in for confirmation.

## Error policy

- Normalize failures once into a Viewer error containing a safe category,
  localized message key or safe fallback, retryability, HTTP status when useful,
  and optional request ID.
- Presentation code switches on the normalized category rather than matching
  upstream message text.
- Expected user-recoverable failures are state, not thrown programming errors.
  Unexpected invariant or rendering failures go to the nearest error boundary.
- Never expose raw response bodies, stack traces, tokens, signatures, challenges,
  authentication bodies, or private object data. A request ID is the support
  correlation value.

## Testing and enforcement

- Domain rules and adapters have table-driven unit tests covering missing,
  unknown, malformed, high-precision, and future-union values.
- Service tests mock the SDK/BFF boundary and cover retry, cancellation,
  concurrency, stale authorization, terminal session, and normalization.
- Import-boundary linting prevents generated types and server-only modules from
  reaching domain, hooks, or presentation code.
- Add a regression test whenever a bug crosses a layer, races an async workflow,
  or exposes more data than the view requires.
