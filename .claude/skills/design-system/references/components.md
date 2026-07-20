# Component inventory

Base primitives live in `src/presentation/components/ui/` (shadcn: button, card, input, label,
radio-group, textarea, badge, progress, combobox, toggle, toggle-group, input-group). Wikain-specific
composites live in `src/presentation/components/`. Rules per component:

> **Reach for the primitive first.** A styled `div`/`button` standing in for a real control is a
> bug, not a shortcut — see the exceptions note at the bottom. Strip `shadow-*` from anything
> `shadcn add` brings in (elevation is 1px rules + paper steps), and fix its import paths: the CLI
> writes `src/presentation/...`, but this layer uses the `@/` alias (DIR-7).

## Primitives (ui/)

- **Button** — variants: `default` (ink bg), `outline` (line border, paper bg), `ghost`, `link`,
  `destructive` (terracotta). **Marigold never fills a button.** Min touch target 44px on mobile.
  A text action ("Sign out", "Stop the test") is `variant="link"`, never a bare `<button>`.
- **Card** — paper-raised, `rounded-xl` (8px), `border-line`, **no shadow**. One thought per panel.
- **Input / Textarea** — paper-raised, `border-line`, focus ring marigold-deep. Two variants (cva):
  `box` (the default bordered field) and `bare` (borderless/transparent, no ring) — `bare` exists so a
  textarea can live inside another surface. Free-production sentence entry does NOT use the boxed
  textarea; it uses **`SentenceField`** (below), a `bare` Textarea in a cloze-style well.
- **Badge** — tags: `rounded-sm` (3px), mono `text-[10.5px]`, tracked. Never `rounded-full`.
- **Progress** — 4px track paper-sunken, fill marigold. Session progress (top of review).
- **Combobox** — the filterable select. Use it over a plain select whenever the list is long enough
  that scanning fails; the timezone field (~400 IANA zones) is the reference case.
- **ToggleGroup** — an exclusive or multi option set. `type="single"` for the `/words` mastery
  filter, `type="multiple"` for the onboarding known-words chips. Gives roving focus and pressed
  state that hand-rolled buttons did not.
- **RadioGroup** — one exclusive choice rendered as cards (the coarse-level picker): wrap each row
  in a `Label` so the whole card is the target.

## Composites

- **MasteryChip** `{state}` — tinted chip per mastery token (see tokens.md). Mono, lowercase, 3px
  corners. Fluent is the only solid chip. Recognized's *label* takes marigold-deep (marigold is not
  a text color on paper).
- **CounterStat** — the headline "Words you can use" stat: **mono 40px numeral** + label. Animates
  value changes with motion (count up/down, ~600ms). Decreases are visually identical to increases.
- **GoalGauge** — daily goal (CNT-8): a **tick-marked linear gauge**, marigold fill, mono `n/goal`
  + "sentences". Ticks make the unit (one sentence) countable rather than merely proportional; they
  are dropped above 12 units, where they'd read as noise. Fills once; never pulses when incomplete,
  no guilt state. *(Replaced the circular GoalRing.)*
- **TierTag** — metadata line on a review card: `recognition / seen`, `free-production /
  productive`, maintenance adds `/ maintenance`. `font-mono text-[10.5px] uppercase tracking-wide
  text-ink-faint`. *Currently rendered inline via `EntryHeader` + `pos-label`, not a standalone
  component.*
- **Sentence** `{children}` — a specimen sentence (a full example / the language shown as an utterance),
  cast as **italic serif wrapped in curly double quotes “…”** with the quote glyphs in `text-ink-faint`
  (`aria-hidden`) and a hanging opening quote (negative first-line indent). This is the ONE treatment
  that distinguishes a sentence from a **definition** (upright/roman serif — `EntryDefinition`) and from
  **instrument copy** (sans `text-ink-soft`), so the learner tells the three registers apart at a glance.
  Used for the RL-6 model/example reveal. Keep it to single specimen sentences — a full body set in
  italic taxes readability.
- **SentenceWell** — the shared shaded well that hosts both `SentenceField` and `ClozeSentence`
  (`-mx-3 flex items-stretch gap-1 rounded-lg bg-paper-sunken px-3 py-2 cursor-text`), with the two
  framing double quotes as flex columns — opening `self-start` (top-left), closing `self-end`
  (bottom-right). **Always shaded** (not hover/focus). Extracted so cloze↔free parity — same tint, same
  padding, same quote framing — is structural, not copied; they drifted before (cloze hung its quote via
  `text-indent`, free framed it in a flex column, so text started at different x). `label` prop renders
  it as a `<label>` (cloze's implicit-association need) instead of a `<div>`.
- **SentenceField** — the TIER-6 free-production writing surface. A `bare` Textarea (italic serif,
  marigold caret) flexed inside `SentenceWell`. This gives cloze↔free **parity**: both are a serif
  specimen on the same always-shaded well — cloze has an inline underlined blank, free is the whole line.
  Deliberately NOT a boxed textarea, which broke the "one dictionary entry" feel.
- **ClozeSentence** `{clozedSentence}` — the TIER-5 cloze sentence, splitting on its single `_` around
  the BlankInput, rendered in the flex-1 middle column of `SentenceWell` (`label`). Shares the well's
  framing double quotes and always-shaded tint with `SentenceField`; the italic-serif middle carries the
  specimen cast and the inline blank shares the italic so a completed line reads as one sentence. Because
  the well is a native `<label>`, clicking anywhere in the sentence focuses the blank with no JS and no
  `htmlFor` (an input inside its label is associated implicitly) — the whole sentence really is the
  target, so the affordance is honest. The blank keeps its own `aria-label`, which wins over the label
  text, so the field is not announced by reading the entire sentence back.
- **HeadwordBlank** — the unanswered headword slot on cloze (empty state) + recognition: a **dotted,
  faint** rule, NOT a solid one. The solid underline is reserved for real inputs (the cued headword, the
  cloze sentence blank), so a reveal slot and a fill slot never look identical — a learner is never
  faced with two matching blanks and left guessing which to answer.
- **BounceCallout** `{kind}` — neutral inline callout for RL-2/3/4 bounces: paper-sunken bg,
  ink-soft text, no icon color drama (info icon, ink-faint). Appears instantly (no spinner ever
  precedes it). Copy from brand voice.md.
- **SoftBounceCallout** `{lane}` — the FIT-7 cloze lanes: same neutral treatment as BounceCallout
  (a soft bounce is *not* the learner's fault and *not* an INV-2 bounce). The different-sense lane
  carries `bounce_gloss`; both end on the first-letter cue. Never reveals the target.
- **CheckingIndicator** — NET-2: inline row "Checking…" with a 3-dot gentle pulse (motion,
  loops). Only rendered after a rule-layer pass.
- **VerdictPanel** — judged outcome (LOOP-4). A wash-tinted bar with a **3px accent rule on its left
  edge** and a **mono PASS/FAIL label** (text, not an icon — the verdict must not rest on color
  alone); the panel itself stays paper. Fail adds mono DETECTED / INTENDED sense lines. Hosts
  EditedSentence + enrichment, and the demotion line ("moved back a step…") on fail.
- **EditedSentence** — EDIT-7 inline render on the learner's own sentence (serif): per-edit
  `<del>` (strikethrough, reason color) + inserted `<ins>` (reason color, no underline-skip).
  Tap/click a span → that edit's `one_line_feedback` (on-demand only). Fallback mode
  (EDIT-4): renders `corrected_sentence` whole with a "suggested rewrite" label instead of spans.
- **SessionSummary** — end of session: sentences written (goal progress), words moved (promotions
  and demotions listed with equal visual weight), counter delta.
- **WordRow / WordDetail** — words browser: serif word, MasteryChip, retrievability meter (thin
  bar: moss ≥ R_floor 0.70, terracotta below), **marigold counted-dot** when in "words you can use"
  (CNT-2/3). *WordRow is currently inlined in `words.index.tsx`, not a standalone component.*
- **CoarseLevelPicker / LexTaleTest** — the two SEED-2 placement instruments. Presentational only;
  scoring is server-side (the client never sends a score).

### Specified but NOT built

These are spec'd states with no component yet. They are **not** rebrand work — building them is a
feature slice (PRAG-1). Don't assume they exist:

- **ModelSentenceReveal** — RL-6 cap: model sentence in a serif quote block + "Try once more" /
  "Skip for now". Skip = no rating, card stays due.
- **OfflineBar / RetryNotice** — NET-5 block state and NET-3 neutral failure notice. Both neutral
  ink-soft; **never terracotta** (not the learner's fault). Sentence always preserved.
- **OnboardingStep** — a step-card shell with step dots. Onboarding currently renders its steps
  directly.

## Iconography

lucide-react, 1.5px stroke, `size-4`/`size-5`, ink-soft default. Icons support text, never replace
it on outcome states.

## The three sanctioned native-primitive exceptions

Each carries a header comment explaining itself. Don't "fix" them, and don't add a fourth without
the same justification:

- **`blank-input.tsx`** — a native `<input>` sharing a CSS-grid cell with an invisible mirror span,
  so the blank auto-sizes to typed text. shadcn `Input`'s fixed `h-9` + border-box styling fights it.
- **`word-option-list.tsx`** — raw Radix `RadioGroup` rather than `ui/radio-group.tsx`, because
  `RadioGroupItem` hard-codes a `size-4 rounded-full` dot and the design needs the whole row as the
  target with the numeral as the affordance.
- **`edited-sentence.tsx`** — each edit is a `span[role=button]`, because a `<button>` is
  `inline-block` and cannot fragment across line boxes: a multi-word edit became one atomic centered
  block (UA `text-align: center`, which the paragraph does not override) inside a left-aligned
  paragraph. EDIT-7 renders on the learner's own sentence, so the edit must be a true inline box.
