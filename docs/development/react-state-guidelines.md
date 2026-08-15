# React and state guidelines

These rules apply to React 19, Next.js App Router rendering, forms, hooks,
TanStack Query, and browser-owned state.

## Server-first composition

- Pages and layouts are Server Components by default. Keep the route file on the
  server and compose the smallest practical Client Component for state, event
  handlers, browser APIs, wallet connectors, WebAuthn, or an interactive remote
  workflow.
- A `"use client"` directive defines a module-graph boundary. Do not add it to a
  route merely because one descendant is interactive.
- Fetch read-heavy initial route data in a Server Component when that removes a
  client waterfall or improves the first useful render. Pass a minimal domain
  projection or hydrate a reviewed query; do not duplicate independent server
  and browser sources of truth.
- Use `loading.tsx`, `error.tsx`, `not-found.tsx`, and focused `Suspense`
  boundaries for route-level states. Feature-level recoverable query failures
  still render their own retry state.
- Treat `params`, `searchParams`, cookies, and other dynamic Next.js APIs
  according to the installed Next.js version. Do not copy signatures from an
  older App Router release.

## State ownership order

Choose the first suitable owner:

1. The API, chain, or server session owns authoritative remote state.
2. The URL owns shareable and navigable filters, sorting, selection, and safe
   pagination state.
3. TanStack Query owns browser-cached remote state.
4. A focused component or reducer owns ephemeral interaction and form state.
5. A reviewed external store owns a non-React browser subscription or persisted
   non-sensitive preference.

Do not copy remote data into local state merely to render or filter it. Do not
put transient menu/modal state into context or the URL.

## TanStack Query conventions

- Define typed query-key factories and reusable query option builders by
  feature. Raw query-key arrays do not appear in pages or components.
- Every query-key includes each wallet identity, object ID, filter, variant,
  locale-dependent projection, and cursor that changes the result.
- Query functions accept and propagate cancellation where the transport allows
  it. A stale search or unmounted feature must not overwrite the current result.
- Use `useInfiniteQuery` only for append-style sequential cursors. Use a normal
  query keyed by cursor when Previous/Next navigation displays one cursor page
  at a time.
- Server mutations use focused `useMutation` hooks in client workflows. The
  mutation owns pending/error state and invalidates the smallest key family
  through the key factory after an adapted success.
- Never edit generated DTOs or cached domain objects in place. Logout may clear
  user-scoped cache globally; ordinary mutations may not.
- Set retry, stale-time, and refetch behavior deliberately by data sensitivity.
  Authentication and non-idempotent mutations do not retry implicitly.
- Enable the TanStack Query strict ESLint configuration and keep its dependency
  and stability rules at error severity.

## Component and hook behavior

- Components and hooks are pure and idempotent during render. Props, context,
  hook inputs/outputs, module state, and query data are immutable.
- Derive render values during render. Do not use state plus an Effect to mirror
  props, query data, or another state value.
- Effects synchronize with an external system. They are replay-safe, declare
  complete dependencies, and clean up listeners, observers, timers, requests,
  message channels, focus/scroll changes, and subscriptions.
- Use `useSyncExternalStore` for a real external store with stable subscribe,
  client snapshot, and server snapshot functions.
- Use `useMemo`, `useCallback`, and `memo` only for measured expensive work or a
  referential contract such as an Effect dependency, context value, memoized
  child, or external subscription. Do not use them as ceremonial wrappers.
- Hooks expose a focused domain API. A hook must not hide unrelated session,
  navigation, query, and modal ownership behind a broad return object.
- Use stable semantic keys derived from domain identity. Never use an array
  index for cursor results, action logs, or mutable object collections.

## Workflows and forms

- Use semantic `<form>` submission and native validation attributes where they
  match the product rule. Preserve entered values and explicit validation state
  after recoverable failure.
- Use `useActionState` and `useFormStatus` when a workflow intentionally uses a
  React Action and benefits from its submission semantics. Use a TanStack
  mutation for client-owned BFF/SDK workflows. Do not mix both pending-state
  systems for one submission.
- Model multi-step authentication, action confirmation/execution, and account
  deletion with a reducer or discriminated union. Impossible state combinations
  must be unrepresentable.
- Event-caused work belongs in the event or action that caused it. Do not trigger
  a mutation from an Effect in response to a flag set by an event.
- Use transitions or deferred values only for non-urgent rendering. They do not
  replace debouncing, request cancellation, or a visible network pending state.
- Use optimistic UI only under the architecture guide's rollback and
  idempotency requirements.

## Context and providers

- Context is for stable, genuinely cross-cutting capabilities such as the safe
  session projection, theme, query client, or reviewed connector state.
- Place providers as low as their consumer set permits. A root provider must not
  force unrelated public routes into an authenticated or browser-only data flow.
- Split state and actions when doing so prevents broad rerenders or accidental
  mutation. Context values expose domain concepts rather than generated DTOs.
- A missing required provider fails immediately with a useful development error.

## Testing

- Test observable behavior instead of hook implementation details. Use roles,
  names, and user events.
- Add focused coverage for reducers, conditional rendering, Effect cleanup,
  Strict Mode replay, stale responses, cancelled requests, provider boundaries,
  focus behavior, and cache invalidation.
- Mock wallet connectors, WebAuthn, time, transport, and query clients
  deterministically. Tests do not open real wallets, use real passkeys, or call
  live endpoints.
