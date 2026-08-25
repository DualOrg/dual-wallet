# UI and accessibility guidelines

These rules apply to wallet-owned components, styles, interaction patterns, and
user-visible copy. The target is WCAG 2.2 AA in both light and dark themes.

## Design-token system

- Maintain three layers: primitive values, semantic product tokens, and
  component tokens. Feature components consume semantic or component tokens,
  never palette values directly.
- Tokenize color, typography, spacing, sizing, radius, elevation, motion,
  content width, and z-index. Preserve Console App provenance, but copy reviewed
  values into wallet-owned files.
- Raw colors and arbitrary layout constants are allowed only in token
  definitions, reviewed brand artwork, sandbox policy, or genuinely runtime
  geometry such as an API-provided aspect ratio. Document non-obvious
  exceptions.
- Avoid inline style objects for ordinary product layout. Use a semantic class
  or component variant so responsive, theme, hover, focus, and disabled behavior
  stays reviewable in one place.
- Components expose a small semantic variant API. Do not accept arbitrary color,
  radius, shadow, or spacing props that bypass the system.

## Responsive layout

- Design mobile-first and verify at 320 CSS pixels without horizontal page
  scrolling. Content must reflow at browser zoom rather than being clipped by
  fixed widths or heights.
- Prefer content-driven grid and container behavior over device-specific
  breakpoints. Do not turn end-user inventory into an administrator table on
  narrow screens.
- Interactive targets are at least 44 by 44 CSS pixels unless they are inline
  text links. Preserve adequate separation between adjacent destructive and
  non-destructive controls.
- Reserve media and skeleton dimensions to avoid layout shift. Faces and images
  use a validated aspect ratio with a safe fallback.
- Test phone, tablet, and desktop widths in both themes, including long
  translations, large text, reduced motion, loading, empty, and error states.

## Semantic interaction primitives

- Prefer native HTML semantics. A link navigates; a button performs an action;
  a form submits related input. Do not add ARIA when a native element already
  provides the required role and behavior.
- Feature code does not hand-roll dialogs, alert dialogs, menus, tabs,
  comboboxes, tooltips, or focus traps. Use a reviewed design-system primitive
  that implements the complete keyboard and focus pattern.
- Modal dialogs trap focus, make background content inert, close with Escape
  when safe, expose a visible title, provide an explicit close/cancel control,
  and restore focus to the invoking control. Destructive dialogs initially
  focus the least destructive action or explanatory content.
- Menus implement arrow-key navigation, Escape, focus return, and correct menu
  semantics. If a popover contains ordinary links and does not need menu
  keyboard behavior, implement it as a labelled disclosure instead of giving it
  `menu` roles.
- Tabs have stable tab and panel IDs, `aria-controls`, roving keyboard focus,
  arrow-key navigation, and a labelled tab list. Do not use tabs merely to style
  a group of unrelated buttons.
- Every icon-only control has a localized accessible name. Decorative icons are
  hidden from assistive technology.

## Forms and feedback

- Every field has a programmatically associated visible label, stable ID,
  appropriate `type`, `name`, and `autocomplete`, and mobile input hints where
  applicable.
- Field errors have stable IDs and are referenced by `aria-describedby`.
  Invalid fields set `aria-invalid`; descriptions and hints participate in the
  same description relationship.
- On failed submission, keep entered values, focus an error summary or the first
  invalid field, and announce the failure without duplicating every message.
- Pending controls remain understandable, prevent duplicate submission, and do
  not replace their accessible name with an unlabeled spinner.
- Use `role="alert"` for urgent failures and a polite status region for success
  or background updates. Loading containers expose `aria-busy` where it helps;
  visual skeletons are decorative.
- Never rely on color alone for status, selection, validation, ownership, or
  action availability.

## Localization and formatting

- All visible and non-visible user-facing copy belongs in `messages/`, including
  ARIA labels, image alternatives, titles, placeholders, metadata, fallbacks,
  empty states, validation, and default object descriptions.
- Use `next-intl` formatting APIs and the active locale for dates, relative
  times, numbers, fees, units, lists, and plurals. Do not construct an
  `Intl.*Format` with a hard-coded locale in feature code.
- Keep protocol identifiers and exact values unlocalized, but localize their
  labels and explanatory text. Preserve exact decimal and fee strings.
- Verify layout with the longest supported translations. Do not abbreviate
  security or recovery instructions merely to fit a component.

## Motion, focus, and visual states

- Every interactive primitive defines default, hover, active, focus-visible,
  disabled, pending, and error treatment in light and dark themes.
- Focus indicators remain visible and are not covered by sticky headers,
  overlays, or scroll containers.
- Respect `prefers-reduced-motion`. Motion must not be required to understand a
  state change; repeated or decorative animation is removed under reduced
  motion.
- Do not animate layout for security prompts, destructive confirmation, or
  authentication ceremonies in a way that moves the action under the pointer.

## Verification

- Component tests use roles, names, and labels and cover keyboard operation,
  focus entry/return, validation association, and accessible status updates.
- Browser tests cover complete auth and destructive flows with keyboard-only
  operation.
- Run automated accessibility checks and reviewed visual snapshots at the
  supported viewport/theme matrix. Automation supplements rather than replaces
  manual keyboard and screen-reader review of complex primitives.
