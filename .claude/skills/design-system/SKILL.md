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

## Layout & shape

- **Mobile-first at 390px**, single column, max content width `max-w-md` (448px) centered; desktop
  scales to `max-w-xl` (576px) content + whitespace (no multi-pane layouts).
- App chrome: sticky top bar (wordmark left, counter right) + bottom tab nav on mobile
  (Home / Words / Settings), top-right inline nav on `sm+`. **The review session is chromeless**
  (focus mode): only a thin progress bar, a close button, and the card.
- Spacing rhythm: 4px base; sections separate by `space-y-6`; panel padding `p-5`/`p-6` (20–24px).
- One panel = one thought. Never stack two decisions in one panel.
- **Radius:** panels `rounded-xl`/`rounded-lg` (8px) · buttons & inputs `rounded-md` (6px) · chips
  & tags `rounded-sm` (3px). **Nothing is a pill** — `rounded-full` is only for genuine dots (the
  counted dot, checking dots, radio marks, the avatar).
- **Elevation is by rule:** paper (the field) → paper-raised (panels & inputs) → paper-sunken (wells
  & bounces), separated by 1px lines. **No shadows** — the UI is a printed form, not floating cards.

## Type scale — three voices, strictly cast

Serif = the language in play. Sans = the instrument speaking. Mono = the instrument measuring
(every count, tag, tally, R value; tabular numerals always).

| Use | Class |
| --- | --- |
| Target word (review card) | `font-serif text-4xl font-semibold` (36px/600) |
| Learner sentence / cloze / model | `font-serif text-xl` (20px, leading-relaxed) |
| Counter numeral | `font-mono text-[40px] font-medium tabular-nums` |
| Page title | `text-xl font-semibold` (sans 20px/600) |
| UI labels/buttons | `text-sm font-medium` (Plex Sans is the default sans) |
| Metadata (pos · CEFR · tier) | `font-mono text-[10.5px] text-ink-faint uppercase tracking-wide` |

A count in sans, or a page title in serif, is a **miscast**. The voice tells the learner what kind of
thing they are reading before they read it.

## Motion principles (details in `references/motion.md`)

- Durations and the easing curve are constants in `src/presentation/lib/motion.ts` (`DURATION`,
  `EASE`). **Import them; never re-type a literal** — the curve had already drifted at most call
  sites when they were literals.
- Calm and brief: 150–300ms, ease-out. Nothing loops except "checking…" (a gentle pulse) and the
  goal gauge fill.
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
- **Use the shadcn primitive, never a styled `div`/`button`.** A hand-rolled control is a bug: the
  native `<select>` this system used to carry rendered its panel in OS chrome that ignored every
  token. Three documented exceptions exist (`blank-input.tsx`, `word-option-list.tsx`,
  `edited-sentence.tsx`) — each carries a header comment saying why; don't "fix" them, and don't add a
  fourth without one.
