# Motion — durations, easings, patterns

Library: **motion** (`import { motion, AnimatePresence } from "motion/react"`). Calm, brief,
paper-like. Nothing celebratory.

## Tokens

**The values live in code: `src/presentation/lib/motion.ts`.** Import `DURATION` / `EASE` /
`EDIT_STAGGER`; never re-type a literal. They were literals at ~20 call sites once, and the easing
had already drifted — most sites passed a duration with no `ease` and silently fell back to
motion's default curve. Durations are **seconds** in code (motion's unit), milliseconds here.

| Name | Value | Use |
| --- | --- | --- |
| `DURATION.fast` | 150ms | hovers, chips, popovers, bounce fade |
| `DURATION.base` | 250ms | card enter, verdict reveal, callout appear |
| `DURATION.slow` | 600ms | counter numeral, gauge fill |
| `EASE` | `[0.25, 0.1, 0.25, 1]` (ease-out feel) | everything; no spring/bounce on outcomes |
| `EDIT_STAGGER` | 40ms | the per-span delay in EditedSentence |

## Patterns

- **Card enter** (next word in session):
  `initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
  transition={{ duration: DURATION.base, ease: EASE }}` wrapped in `AnimatePresence mode="wait"`;
  exit = fade only.
- **Verdict reveal** (pass/fail): fade 250ms. Same animation for pass and fail — the *color*
  carries the meaning, not the movement.
- **Inline edits** (EditedSentence): spans stagger in 40ms apart, opacity-only.
- **BounceCallout**: appears with a 150ms fade, no movement (instant feel, NET-2).
- **CheckingIndicator**: 3 dots, opacity pulse `0.3 → 1`, 1.2s loop, staggered 150ms. The only
  looping animation besides gauge fill.
- **Counter numeral**: animate the number with
  `animate(from, to, { duration: DURATION.slow, ease: EASE, onUpdate })` (motion's `animate`);
  identical treatment up or down (CNT-4).
- **GoalGauge**: the fill `width` animates 600ms, once, on load. **Never pulses at rest** — an
  incomplete goal is not a nag (CNT-9).
- **Page transitions**: none between app routes (instant), only within-session card swaps animate.
- **MCQ options**: on grade, correct option tints moss, chosen-wrong tints terracotta — 150ms
  color transitions, no shake.

## Reduced motion

Wrap movement in `useReducedMotion()` from `motion/react`: when true, all `y` offsets become 0 and
loops stop (checking dots become a static "Checking…" text); opacity fades may remain.

## Forbidden

Confetti/particles, scale-bounce on success, shake on failure, looping attention-seekers on idle
UI, skeleton shimmer on deterministic grades (they're instant — NET-2).
