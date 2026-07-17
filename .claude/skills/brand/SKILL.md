---
name: brand
description: Wikain brand identity — positioning, personality, voice, wordmark, and core palette. Use when writing any user-facing copy, choosing colors/type, designing screens, or making anything the learner sees or reads.
---

# Wikain — Brand

**Wikain** (Tagalog: *to say, to utter*; from *wika*, language) trains Filipino professionals to
*produce* upper-intermediate English — the sentence you write **is** the lesson. The brand must feel
like a **calibrated instrument**, never a game.

## Positioning

- For: Filipino professionals with strong receptive English, closing the productive gap in formal
  writing (PRD §1).
- Promise: "words you can actually use" — the counter is the product's value, and it is **honest**
  (it ticks down when memory fades; CNT-4).
- Not: a streak-driven gamified app. No confetti, no coercive streaks, no vanity metrics
  (CNT-7/CNT-9 are normative).

## Personality (in priority order)

1. **Honest** — progress can regress; we show it plainly and without drama. Honesty is a *layout*
   principle, not just a copy one: demotions weigh the same as promotions, and a counter decrease
   animates exactly like an increase.
2. **Precise** — a cool, near-neutral field and one signal color. The instrument is calm and
   measured; nothing is louder than the thing it is measuring.
3. **Editorial** — the learner's sentence is typeset with care (serif, generous size); the UI stays
   quiet around it. The sentence is the hero.
4. **Filipino, understated** — English UI; Tagalog appears only in the name. Warmth is carried by
   the single marigold signal, not by the field: it is the one warm thing in a cool instrument,
   which is what makes it read as a mark rather than as decoration. Never flags or clichés.

## Voice

Plain, direct sentences. Second person. No exclamation marks on system messages; at most one on a
genuine win. Never blame the learner; never blame them for *our* failures (network, judge). Bounce
copy frames retry as staying in the flow ("let's keep this one in English"), never as an error.
**Full microcopy catalog (every loop state has fixed copy): `references/voice.md`.**

## Wordmark

Lowercase **`wikain`** set in Source Serif 4 (the display serif), ink color, with the terminal
**period in marigold** — `wikain.` — the period as "something said." It takes `marigold-deep`, the
contrast-safe on-paper tint, because it renders as a text glyph. Favicon/avatar: marigold square,
ink `w.`. No other logo. Don't outline, gradient, or animate the wordmark.

## Core palette (summary — full values + usage rules in `references/palette.md`)

| Role | Color | Feel |
| --- | --- | --- |
| Paper (bg) | cool near-neutral `oklch(0.982 0.003 250)` | the field |
| Ink (text/primary) | blue-black `oklch(0.24 0.02 265)` | the pen |
| Marigold (signal) | `oklch(0.70 0.15 66)` | the live thing: goal fill, counted dot, focus, the wordmark period |
| Moss (success) | `oklch(0.57 0.10 150)` | pass, healthy retrievability |
| Terracotta (fail/destructive) | `oklch(0.55 0.15 32)` | judged fail, destructive — measured, not alarming |

Primary buttons are **ink**, never marigold. **Marigold discipline:** it never fills a button and
never colors running text; more than two marigold elements on a screen means demoting one.

## Typography — three voices, strictly cast

- **Source Serif 4** (variable serif) — **the language in play**: headwords, learner sentences,
  cloze frames, model sentences, glosses. Strictly the learner's language, never UI.
- **IBM Plex Sans** (variable sans) — **the instrument speaking**: labels, buttons, verdict lines,
  prompts, page titles, settings.
- **IBM Plex Mono** — **the instrument measuring**: every count, tag, tally, R value, and spec
  reference. Tabular numerals always.
- A target word inline in UI text is *always* serif italic, never quoted or bolded sans.

The cast is the rule. A number in sans, or a page title in serif, is a miscast — the voice tells the
learner what kind of thing they are reading before they read it.

## Hard rules

- No confetti, particle effects, or celebratory explosions — ever (CNT-7).
- No streak counters or guilt copy (CNT-9). A daily goal exists; a missed day is silent.
- The counter may visibly decrease; never fake monotonicity (CNT-4).
- Judged-fail copy states what happened + shows the edits; it never says "wrong answer" (the
  learner's sentence is corrected, not graded like a quiz).
- Bounces are not errors. Rule-layer bounces (INV-2), cloze soft bounces (FIT-7), offline, and retry
  are neutral ink on sunken paper — no red, no spinner before them. Terracotta is reserved for
  judged gate fails and destructive actions.
