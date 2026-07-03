# Component inventory

Base primitives live in `src/presentation/components/ui/` (shadcn-style: button, card, input,
label, radio-group, textarea, badge, progress). Wikain-specific composites live in
`src/presentation/components/`. Rules per component:

## Primitives (ui/)

- **Button** — variants: `default` (ink bg), `outline` (line border, paper bg), `ghost`,
  `destructive` (terracotta). Amber never fills a button. Min touch target 44px on mobile.
- **Card** — paper-raised, `rounded-xl`, `border-line`, `shadow-xs`. One thought per card.
- **Input / Textarea** — paper-raised, `border-line`, focus ring amber-deep. Learner sentence
  entry uses **Textarea with `font-serif text-xl`** — the learner writes in the content voice.
- **Badge** — chips: `rounded-full text-xs font-medium px-2.5 py-0.5`.
- **Progress** — 4px track paper-sunken, fill amber. Used for session progress (top of review).

## Composites

- **MasteryChip** `{state}` — tinted chip per mastery token (see tokens.md). Fluent is the only
  solid chip. Always lowercase label.
- **CounterStat** — the headline "Words you can use" stat: Fraunces numeral + label. Animates
  value changes with motion (count up/down, ~600ms). Decreases are visually identical to increases.
- **GoalRing** — daily goal (CNT-8): thin circular ring, amber fill, `n / goal` in the center,
  unit label "sentences today". Fills once; never pulses when incomplete, no guilt state.
- **TierTag** — metadata line on a review card: `recognition · seen`, `free production ·
  productive`, maintenance adds `· maintenance`. `text-xs uppercase tracking-wide text-ink-faint`.
- **WordTitle** — target word + `pos · CEFR` metadata. Fraunces 4xl.
- **BounceCallout** `{kind}` — neutral inline callout for RL-2/3/4 bounces: paper-sunken bg,
  ink-soft text, no icon color drama (info icon, ink-faint). Appears instantly (no spinner ever
  precedes it). Copy from brand voice.md.
- **ModelSentenceReveal** — RL-6 cap: shows the model sentence in a serif quote block + "Try once
  more" / "Skip for now" buttons.
- **CheckingIndicator** — NET-2: inline row "Checking…" with a 3-dot gentle pulse (motion,
  loops). Only rendered after a rule-layer pass.
- **VerdictPanel** — judged outcome (LOOP-4). Pass: moss check + "Nicely used." Fail: terracotta
  header + sense explanation (detected vs intended). Hosts EditedSentence + enrichment. Also the
  demotion line ("moved back a step…") on fail.
- **EditedSentence** — EDIT-7 inline render on the learner's own sentence (serif): per-edit
  `<del>` (strikethrough, reason color) + inserted `<ins>` (reason color, no underline-skip).
  Tap/click a span → popover with that edit's `one_line_feedback` (on-demand only). Fallback mode
  (EDIT-4): renders `corrected_sentence` whole with a "suggested rewrite" label instead of spans.
- **UnscoredPracticeNote** — SM-8: after a judged fail, input remains with the "already recorded"
  label.
- **OfflineBar / RetryNotice** — NET-5 block state and NET-3 neutral failure notice. Both neutral
  ink-soft; never terracotta (not the learner's fault).
- **SessionSummary** — end of session: sentences written (goal progress), words moved (promotions
  and demotions listed with equal visual weight), counter delta.
- **WordRow / WordDetail** — words browser: serif word, MasteryChip, retrievability meter (thin
  bar: moss ≥ R_floor 0.70, terracotta below), "in your usable words" dot when counted (CNT-2/3).
- **OnboardingStep** — full-screen step card with step dots; back always available; every
  placement step skippable (SEED-1: win before calibration).

## Iconography

lucide-react, 1.5px stroke, `size-4`/`size-5`, ink-soft default. Icons support text, never replace
it on outcome states.
