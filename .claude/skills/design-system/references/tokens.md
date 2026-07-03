# Design tokens — `src/presentation/styles.css`

Tailwind v4: raw values live on `:root`, semantic names are exposed via `@theme inline` so utility
classes exist for each. shadcn variables (`--background`, `--primary`, …) are kept and remapped to
brand values so existing `components/ui/*` keep working.

## Semantic → utility map

| Token (CSS var) | Utility | Value (source: brand/references/palette.md) |
| --- | --- | --- |
| `--paper` | `bg-paper` | `oklch(0.977 0.008 84)` |
| `--paper-raised` | `bg-paper-raised` | `oklch(0.993 0.004 84)` |
| `--paper-sunken` | `bg-paper-sunken` | `oklch(0.955 0.010 84)` |
| `--ink` | `text-ink` / `bg-ink` | `oklch(0.27 0.02 55)` |
| `--ink-soft` | `text-ink-soft` | `oklch(0.45 0.015 55)` |
| `--ink-faint` | `text-ink-faint` | `oklch(0.58 0.012 55)` |
| `--line` | `border-line` | `oklch(0.90 0.010 84)` |
| `--amber` | `*-amber` | `oklch(0.75 0.14 75)` |
| `--amber-deep` | `*-amber-deep` | `oklch(0.62 0.13 70)` |
| `--amber-wash` | `bg-amber-wash` | `oklch(0.95 0.035 85)` |
| `--moss` | `*-moss` | `oklch(0.58 0.10 145)` |
| `--moss-wash` | `bg-moss-wash` | `oklch(0.95 0.03 145)` |
| `--terracotta` | `*-terracotta` | `oklch(0.55 0.16 30)` |
| `--terracotta-wash` | `bg-terracotta-wash` | `oklch(0.95 0.025 30)` |

## Edit-reason tokens (EDIT-7)

`--reason-sense` (=terracotta), `--reason-grammar` `oklch(0.60 0.14 45)`,
`--reason-collocation` (=amber-deep), `--reason-register` `oklch(0.55 0.06 320)` →
`text-reason-sense`, `decoration-reason-grammar`, etc.

## Mastery tokens (SM-1)

`--mastery-new` (=ink-faint), `--mastery-seen` `oklch(0.78 0.06 80)`, `--mastery-recognized`
(=amber), `--mastery-productive` (=moss), `--mastery-fluent` `oklch(0.45 0.08 195)` →
`bg-mastery-seen/15 text-mastery-seen`-style chips (see components.md → MasteryChip).

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
| `--ring` | amber-deep |

## Fonts

- `--font-serif`: `"Fraunces Variable", Georgia, serif` (via `@fontsource-variable/fraunces`)
- `--font-sans`: `"Inter Variable", system-ui, sans-serif` (via `@fontsource-variable/inter`)
- Imported once in `styles.css`; `font-serif` / default sans utilities.

## Radius & shadow

- `--radius: 0.75rem` (cards `rounded-xl`, buttons/inputs `rounded-lg`, chips `rounded-full`).
- Shadows: cards use `shadow-xs` only; elevation is expressed by paper-raised vs paper, not
  by heavy shadows.
