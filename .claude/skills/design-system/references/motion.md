# Motion — durations, easings, patterns

Library: **motion** (`import { motion, AnimatePresence } from "motion/react"`). Calm, brief,
paper-like. Nothing celebratory.

## Tokens

| Name | Value | Use |
| --- | --- | --- |
| `fast` | 150ms | hovers, chip state, popover |
| `base` | 250ms | card enter, verdict reveal, callout appear |
| `slow` | 600ms | counter numeral, goal-ring fill |
| easing | `[0.25, 0.1, 0.25, 1]` (ease-out feel) | everything; no spring/bounce on outcomes |

## Patterns

- **Card enter** (next word in session):
  `initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}`
  wrapped in `AnimatePresence mode="wait"`; exit = fade only.
- **Verdict reveal** (pass/fail): fade 250ms. Same animation for pass and fail — the *color*
  carries the meaning, not the movement.
- **Inline edits** (EditedSentence): spans stagger in 40ms apart, opacity-only.
- **BounceCallout**: appears with a 150ms fade, no movement (instant feel, NET-2).
- **CheckingIndicator**: 3 dots, opacity pulse `0.3 → 1`, 1.2s loop, staggered 150ms. The only
  looping animation besides ring fill.
- **Counter numeral**: animate the number with `animate(from, to, { duration: 0.6, onUpdate })`
  (motion's `animate`); identical treatment up or down (CNT-4).
- **GoalRing**: SVG `strokeDashoffset` animated 600ms on load/increment. No pulse at rest.
- **Page transitions**: none between app routes (instant), only within-session card swaps animate.
- **MCQ options**: on grade, correct option tints moss, chosen-wrong tints terracotta — 150ms
  color transitions, no shake.

## Reduced motion

Wrap movement in `useReducedMotion()` from `motion/react`: when true, all `y` offsets become 0 and
loops stop (checking dots become a static "Checking…" text); opacity fades may remain.

## Forbidden

Confetti/particles, scale-bounce on success, shake on failure, looping attention-seekers on idle
UI, skeleton shimmer on deterministic grades (they're instant — NET-2).
