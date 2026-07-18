# Design tokens — `src/presentation/styles.css`

Tailwind v4: raw values live on `:root`, semantic names are exposed via `@theme inline` so utility
classes exist for each. shadcn variables (`--background`, `--primary`, …) are kept and remapped to
brand values so existing `components/ui/*` keep working.

**Themes (light / dark / system).** A single `.dark {}` block redeclares **only the ~19 raw tokens**
(the dark values + derivation rules live in `brand/references/palette.md → Dark theme`); the semantic,
shadcn, and mastery names are `var()` aliases and re-resolve per element, so they are **never** restated
in `.dark`. `color-scheme` is set per theme (`light` on `:root`, `dark` on `.dark`) so native controls
follow. The `dark` variant is class-based (`@custom-variant dark (&:is(.dark *))`); a pre-paint inline
script in `__root.tsx` toggles `.dark` on `<html>` before first paint (no flash), and the choice is a
persisted user setting (`settings.theme`, `src/presentation/lib/theme.tsx`).

## Semantic → utility map

| Token (CSS var) | Utility | Value (source: brand/references/palette.md) |
| --- | --- | --- |
| `--paper` | `bg-paper` | `oklch(0.982 0.003 250)` |
| `--paper-raised` | `bg-paper-raised` | `oklch(0.996 0.001 250)` |
| `--paper-sunken` | `bg-paper-sunken` | `oklch(0.957 0.005 250)` |
| `--ink` | `text-ink` / `bg-ink` | `oklch(0.24 0.02 265)` |
| `--ink-soft` | `text-ink-soft` | `oklch(0.44 0.016 262)` |
| `--ink-faint` | `text-ink-faint` | `oklch(0.58 0.012 260)` |
| `--line` | `border-line` | `oklch(0.90 0.007 255)` |
| `--line-strong` | `border-line-strong` | `oklch(0.80 0.007 255)` |
| `--marigold` | `*-marigold` | `oklch(0.70 0.15 66)` |
| `--marigold-deep` | `*-marigold-deep` | `oklch(0.56 0.13 64)` |
| `--marigold-wash` | `bg-marigold-wash` | `oklch(0.951 0.035 70)` |
| `--moss` | `*-moss` | `oklch(0.57 0.10 150)` |
| `--moss-wash` | `bg-moss-wash` | `oklch(0.946 0.030 150)` |
| `--terracotta` | `*-terracotta` | `oklch(0.55 0.15 32)` |
| `--terra-wash` | `bg-terra-wash` | `oklch(0.946 0.025 32)` |
| `--fluent-blue` | `*-fluent-blue` | `oklch(0.44 0.08 210)` |

## Edit-reason tokens (EDIT-7)

`--reason-sense` (=terracotta), `--reason-grammar` `oklch(0.60 0.14 45)`,
`--reason-collocation` (=marigold-deep), `--reason-register` `oklch(0.55 0.06 320)` →
`text-reason-sense`, `decoration-reason-grammar`, etc.

## Mastery tokens (SM-1)

`--mastery-new` (=ink-faint), `--mastery-seen` `oklch(0.68 0.08 85)`, `--mastery-recognized`
(=marigold), `--mastery-productive` (=moss), `--mastery-fluent` (=fluent-blue) →
`bg-mastery-seen/20 text-mastery-seen`-style chips (see components.md → MasteryChip).

## shadcn remap

| shadcn var | mapped to |
| --- | --- |
| `--background` / `--foreground` | paper / ink |
| `--card` / `--card-foreground` | paper-raised / ink |
| `--primary` / `--primary-foreground` | ink / paper-raised |
| `--secondary`, `--muted`, `--accent` | paper-sunken (fg: ink / ink-faint / ink) |
| `--destructive` | terracotta |
| `--success` | moss |
| `--border`, `--input` | line |
| `--ring` | marigold-deep |

## Fonts — three voices (P1)

- `--font-serif`: `"Source Serif 4 Variable", Georgia, serif` (via
  `@fontsource-variable/source-serif-4`) — the language in play.
- `--font-sans`: `"IBM Plex Sans Variable", system-ui, sans-serif` (via
  `@fontsource-variable/ibm-plex-sans`) — the instrument speaking.
- `--font-mono`: `"IBM Plex Mono", ui-monospace, monospace` — the instrument measuring.
  **Plex Mono has no variable build**, so `styles.css` imports the two static weights the scale
  uses: `@fontsource/ibm-plex-mono/400.css` (tags, metadata) and `/500.css` (numerals). Adding a
  third mono weight means adding its import.
- Imported once in `styles.css`; `font-serif` / `font-mono` / default sans utilities.

## Radius & elevation

- `--radius: 8px`, with a **flat 3-step scale** rather than a `calc()` ramp — the three shapes are
  independent decisions, not offsets of one base:
  - `--radius-sm: 3px` → chips & tags (`rounded-sm`)
  - `--radius-md: 6px` → buttons & inputs (`rounded-md`)
  - `--radius-lg` / `--radius-xl`: 8px → panels (`rounded-lg` / `rounded-xl`; Card uses `rounded-xl`)
- **No shadows.** Elevation is 1px rules + paper steps. `shadow-*` is stripped from every `ui/*`
  primitive; if you `shadcn add` a new one, strip it again. A floating surface (popover) uses
  `border-line-strong`, not a drop shadow.
- `rounded-full` survives only for genuine dots: the counted dot, checking dots, radio marks, the
  avatar.
