# 04 — Stage A Rule Layer (deterministic pre-screen)

**Purpose.** Specify the free, in-process, deterministic checks that run before any cloud judge call:
target-word presence, degeneracy, and code-switching (Taglish), plus retry termination.

**Scope.** The pre-screen only. The judge it gates is `06`; the memo between them is `05`; the rating
consequences of a bounce are `02` (`RAT-2`).

**PRD trace.** §5.1, §5.2, §6 ("does not run" list).

**Depends-on.** `00` (`INV-2`); `03` (shared lemma-match, `TIER-5`); `12` (`model_sentence`, lemma,
Tagalog lexicon shipped data).

**Out-of-scope.** Grammar checking (there is none — `06` corrects-and-passes), judge axes (`06`).

---

## Trigger

### RL-1 — The judge runs only on rule-layer-passed free productions
**Trace:** PRD §5.1, §6.
**Requirement:** The cloud judge MUST run **only** on a free-production attempt (including
maintenance) that has already passed every rule-layer check. Recognition, cloze, and cued production
MUST NOT reach the judge.

**Scenario: a deterministic tier never reaches the rule layer or judge**
```
Given a Recognition card
When the learner responds
Then the rule layer is not invoked
And the judge is not invoked
```

---

## The three checks

### RL-2 — Target word present (lemma match, inflection-agnostic)
**Trace:** PRD §5.2.1.
**Requirement:** The rule layer MUST check target presence by **lemma match only** (wink-nlp,
inflection-agnostic, en-US — same as `TIER-5`). Any inflected form counts as present.
- **Truly absent → bounce** (no penalty, no rating, no LLM; `INV-2`).
- **Present but mis-inflected → NOT a bounce.** It proceeds as normal production; any inflection
  error is handled as grammar by the judge (`06`). Bouncing a real attempt as "absent" would inject
  the phantom lapse `INV-2` forbids.

**Scenario: inflected form counts as present**
```
Given a target lemma "negotiate" and a sentence using "negotiated"
When the rule layer checks presence
Then the target is present
And the submission proceeds (it is not bounced)
```

**Scenario: truly absent target bounces with no rating**
```
Given a sentence containing no form of the target lemma
When the rule layer checks presence
Then the submission bounces as "target absent"
And no rating is derived and the scheduler is not called (INV-2)
And no LLM call is made
```

**Scenario: mis-inflected target is not bounced as absent**
```
Given a sentence using a wrong inflection of the present target lemma
When the rule layer checks presence
Then it is NOT bounced as absent
And it proceeds to the judge, which treats the inflection error as grammar
```

### RL-3 — Non-degenerate, real sentence
**Trace:** PRD §5.2.2.
**Requirement:** The rule layer MUST bounce a degenerate sentence (no penalty, no LLM). Degenerate =
**fewer than `DEGENERATE_MIN_CONTENT_TOKENS` (=4) content tokens excluding the target**, OR no finite
verb (wink-nlp POS), OR normalized similarity to the item's `model_sentence` **≥
`VERBATIM_SIMILARITY_THRESHOLD` (=0.90)** (verbatim-copy heuristic).

**Scenario: too few content tokens bounces**
```
Given a free-production sentence with fewer than 4 content tokens excluding the target
When the rule layer runs the degeneracy check
Then the submission bounces as degenerate
And no rating and no LLM call occur
```

**Scenario: near-verbatim copy of the model sentence bounces**
```
Given a submission whose normalized similarity to model_sentence is ≥ VERBATIM_SIMILARITY_THRESHOLD
When the degeneracy check runs
Then the submission bounces as degenerate (verbatim copy)
```

### RL-4 — Language / code-switching (Taglish) check
**Trace:** PRD §5.2.3, §5.6.
**Requirement:** v1 expects clean English. A sentence containing **Tagalog words/clauses**
(code-switching / Taglish) MUST NOT be accepted as-is; the learner MUST be nudged to rewrite in
English (no penalty, framed positively). Detection MUST be deterministic against a **shipped Tagalog
lexicon**, with **no LLM call**. An **all-English** sentence carrying **Tagalog-L1 interference
grammar** (omitted articles, preposition slips, aspect/tense transfer) MUST NOT be treated as
code-switching — it proceeds normally and is corrected-and-passed by the judge (`06`).

**Scenario: Taglish is nudged, not judged**
```
Given a sentence mixing Tagalog words with English (code-switching)
When the rule layer runs the language check against the shipped lexicon
Then the submission is nudged to rewrite in English
And no rating and no LLM call occur
```

**Scenario: L1-interference English proceeds to the judge**
```
Given an all-English sentence with an omitted article (L1 interference, no Tagalog words)
When the language check runs
Then it is NOT flagged as code-switching
And it proceeds to the judge to be corrected-and-passed
```

### RL-5 — No standalone grammar tool in the rule layer
**Trace:** PRD §5.2.4.
**Requirement:** The rule layer MUST NOT include a deterministic grammar blocker. The corrected
sentence, the precise `replacements` (`07`), and the meaning-obscuring-grammar gate are all produced
by the judge (`06`). A deterministic grammar-blocker would reject correct-but-L1-flavored sentences
(the false-negative trust-killer).

---

## Retry termination

### RL-6 — Rule-layer bounce cap (`MAX_RULE_BOUNCE_RETRIES`)
**Trace:** PRD §5.2 (retry termination).
**Requirement:** Rule-layer bounces (absent / degenerate / Taglish) MUST be capped at
`MAX_RULE_BOUNCE_RETRIES` (=3). On reaching the cap the system MUST **reveal the model sentence +
offer skip**. The terminal outcome MUST be **no rating, no FSRS update, card stays due** (`INV-2`).

**Scenario: cap reveals the model sentence with no phantom lapse**
```
Given a free-production card that has bounced MAX_RULE_BOUNCE_RETRIES times
When the next bounce would occur
Then the model sentence is revealed and a skip is offered
And no rating is derived and no FSRS update occurs
And the card stays due
```

**Notes / edge cases:** This closes the no-progress loop without a phantom lapse. Judge fails are
**not** rule-layer bounces — their rating is taken on the first genuine gate fail (`RAT-4`), with no
retry-until-pass.

---

## Deferred (non-normative — [v2] / enable-later)

- Tuning the degeneracy heuristic constants and the similarity threshold from real data (PRD §11
  sign-offs).
