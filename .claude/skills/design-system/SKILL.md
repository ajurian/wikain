---
name: design-system
description: Wikain web design system — tokens, layout, components, motion, and the spec-state→UI map. Use when building or modifying any screen/component in src/presentation, styling with Tailwind, or adding animation.
---

# Wikain — Design System

Implements the `brand` skill in code. Stack: TanStack Start + React 19, Tailwind v4 (`@theme` tokens
in `src/presentation/styles.css`), shadcn-style components in `src/presentation/components/ui`,
**motion** (`motion/react`) for animation. Presentation-only (STACK-2/5/7).

## Source of truth

- **Tokens** live in `src/presentation/styles.css` and are documented in `references/tokens.md`.
  Never hardcode a color/oklch literal in a component — use the semantic Tailwind class
  (`bg-paper`, `text-ink`, `text-mastery-fluent`, `bg-reason-sense/10`, …).
- **Component inventory + usage rules:** `references/components.md`.
- **Motion durations/easings/patterns (with code):** `references/motion.md`.
- **Every spec-mandated UI state and which component renders it:** `references/screen-states.md`.
  Read this before touching the review screen — the judged flow has ~12 distinct states.

## Layout

- **Mobile-first at 390px**, single column, max content width `max-w-md` centered; desktop scales
  to `max-w-xl` content + whitespace (no multi-pane layouts).
- App chrome: sticky top bar (wordmark left, counter right) + bottom tab nav on mobile
  (Home / Words / Settings), top-right inline nav on `sm+`. **The review session is chromeless**
  (focus mode): only a thin progress bar, a close button, and the card.
- Spacing rhythm: 4px base; sections separate by `space-y-6`; card padding `p-5`/`p-6`.
- One card = one thought. Never stack two decisions in one card.

## Type scale

| Use | Class |
| --- | --- |
| Target word (review card) | `font-serif text-4xl font-semibold` |
| Learner sentence / cloze / gloss | `font-serif text-xl` (leading-relaxed) |
| Page title | `font-serif text-2xl font-semibold` |
| Counter numeral | `font-serif text-5xl font-semibold tabular-nums` |
| UI labels/buttons | `text-sm font-medium` (Inter is the default sans) |
| Metadata (pos · CEFR · tier) | `text-xs text-ink-faint uppercase tracking-wide` |

## Motion principles (details in `references/motion.md`)

- Calm and brief: 150–300ms, ease-out. Nothing loops except "checking…" (a gentle pulse) and the
  goal ring fill.
- Cards enter with fade + 8px rise; verdicts reveal with a 250ms fade — **no confetti, no bounce
  spring on outcomes** (brand hard rule).
- Counter changes animate the numeral (count up/down ~600ms); a decrease uses the same animation —
  honest, undramatized (CNT-4).
- Respect `prefers-reduced-motion`: all movement collapses to opacity fades.

## Non-negotiables (spec-driven)

- Deterministic tiers render results **instantly** — no artificial delay, no "checking…" (NET-2).
- Bounces are neutral inline callouts (paper-sunken, ink-soft) that appear instantly; only judged
  fails may use terracotta (INV-2 framing).
- Inline edits render **on the learner's own sentence** (strikethrough + insertion, reason-colored);
  `one_line_feedback` only on tap/hover; whole-sentence correction only in the EDIT-4 fallback
  (EDIT-7).
- While the design is unwired, all data comes from `src/presentation/mock/` — every mock module
  carries a `MOCK DATA` header comment; never let a designed component import from `server/`.
