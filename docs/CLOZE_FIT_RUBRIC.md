# Cloze Fit-Set Classification Rubric

> **Single source of truth** for classifying a candidate word against an item's `intended_sense`
> in its cloze sentence (`docs/AMMENDMENT.md §A4`). This exact text is inlined **verbatim** into
> the build-time generation prompt and the (future) heal-classification prompt — the two must
> never drift (§A4.4). It is versioned by `FIT_RUBRIC_VERSION`
> (`python/src/wikain/pipeline/constants.py`); **editing this file requires bumping that version**,
> which invalidates and re-runs classification (same mechanism as `rubric_version` in PRD §5.3).

The criterion is **not** "is it a synonym" (a dictionary relation; ignores the sentence) and
**not** "does it fit the blank" (both miss classes fit by construction). It is a **two-gate check
of the typed word *in this sentence* against `intended_sense`**:

## Gate 1 — proposition test

Substitute the word into the sentence. Does the resulting sentence assert (approximately) the
**same state of affairs** — same participant roles, same direction of the relation, same truth
conditions — as the sentence with the target?

- *repay* in "I still ___ my brother fifty dollars" → same debtor/creditor roles → **passes**.
- *lend* → roles inverted (speaker becomes creditor) → **fails** → `different_sense_fit`.
- Gate 1 is what catches **converses and antonym-like fits** (the owe/lend case), which a
  "similar meaning?" question misses because converses *feel* related.

## Gate 2 — precision test (Gate-1 passers only)

Is the typed word merely a hypernym / looser / register-shifted expression of the same
proposition? If same proposition but less precise → `same_sense_near_miss`.

- *pay* for *owe*: same situation, loses the "state of indebtedness" component → near-miss.

## Operational prompt form

> "A learner wrote sentence S with word W instead of target T (intended sense: D).
> (a) Does S-with-W describe the same situation, with the same roles for the same participants,
> as S-with-T? If no → `different_sense_fit`.
> (b) If yes: would a teacher say 'correct idea, but the precise word is T'? If yes →
> `same_sense_near_miss`.
> Justify in one line." *(The justification is a scratch field, discarded after generation —
> §A1.2.)*

## Boundary rules

- A word that fits only **ungrammatically** or under a **different subcategorization frame**
  (e.g. requires "___ **to** his brother") is **not in the fit-set at all** → wrong path, no
  bucket.
- **Uncertainty default:** when genuinely uncertain between buckets, classify as
  `different_sense_fit`. Its learner-facing copy ("means something different — try the word for
  {gloss}") is the safer message; the asymmetric harm is telling a learner two non-equivalent
  words are close.
