# 02 — FSRS Rating Derivation & Scheduling

**Purpose.** Specify how the binary FSRS rating is derived from a gradeable outcome, how the
scheduling signal stays separate from mastery, the cloze drop-back rule, and the review-log
persistence required for per-user optimization.

**Scope.** The scheduling signal only (`INV-3`). Mastery transitions are in `01`; the rating
*values* here feed those transitions.

**PRD trace.** §2, §3.6, §4.1 (FSRS wiring).

**Depends-on.** `00` (`INV-1`, `INV-2`, `INV-3`); `01` (which outcomes are gradeable); `04` (which
inputs bounce vs grade); `06` (the judged verdict); `09` (`REQUEST_RETENTION`, optimization).

**Out-of-scope.** Mastery promotion/demotion logic (`01`), counter retrievability (`10`).

---

## Rating scheme

### RAT-1 — Binary `Again`/`Good` in v1
**Trace:** PRD §3.6.
**Requirement:** v1 MUST use a binary rating: **any gate pass → `Good`; any gate fail → `Again`**.
Grades are system-derived, not self-reported; `Hard`/`Easy` MUST NOT be synthesized in v1.

**Scenario: a passing outcome rates Good**
```
Given any tier whose gradeable outcome is a pass
When the rating is derived
Then the FSRS rating is Good
And scheduler.next is called with Good
```

**Scenario: a failing outcome rates Again**
```
Given any tier whose gradeable outcome is a genuine gate fail
When the rating is derived
Then the FSRS rating is Again
And scheduler.next is called with Again
```

### RAT-2 — Rule-layer bounces and cloud failures produce no rating (enforces `INV-2`)
**Trace:** PRD §3.6 (I2), §5.2, §7.
**Requirement:** A rule-layer bounce (target absent / degenerate / Taglish, `04`) or a cloud-call
failure (timeout/5xx/429/offline, `08`) MUST NOT derive a rating and MUST NOT call the scheduler;
the card MUST stay due. (The single most important correctness rule.)

**Scenario: a degenerate-input bounce skips the scheduler**
```
Given a free-production submission flagged degenerate by the rule layer
When the bounce is handled
Then no rating is derived
And scheduler.next is NOT invoked
And no ReviewLog is persisted
And the card stays due
```

**Notes / edge cases:** Cloze **soft bounces** (`FIT-7`) share this consequence (no rating, no
scheduler call, no ReviewLog, card stays due) but are **not** `INV-2` bounces — the input is
well-formed, not malformed. A distinct class; do not fold them into the bounce counter.

### RAT-3 — Scaffolded pass and typo-fixed cloze rate `Good`
**Trace:** PRD §3.6.
**Requirement:** In v1 a scaffolded production pass MUST rate `Good` (flag recorded, `SM-9`), and a
typo-fixed cloze MUST rate `Good` (flag recorded). Latency MUST NOT be used to manufacture a rating
in v1.

**Scenario: scaffolded pass still Good**
```
Given a free-production attempt made with a hint that passes the gate
When the rating is derived
Then the rating is Good
And the scaffolded flag is recorded for the mastery ladder
```

**Notes / edge cases:** The typo-fix rule is realized by the `FIT-9` lane
(DL ≤ `CLOZE_TYPO_MAX_DISTANCE` of the target); only the length-scaled distance + `Hard` mapping
remain Deferred below.

### RAT-4 — First-genuine-fail; no retry-until-pass against the judge
**Trace:** PRD §3.6, §10 step 7.
**Requirement:** The free-production `Again` MUST be taken on the **first genuine gate fail**. The
schedule MUST NOT be gameable into a `Good` by re-submitting after a fail: a resubmission MUST NOT be
re-judged or re-scored (served from memo where identical — never re-judged hoping for a pass).

**Scenario: resubmission after a fail does not overturn the rating**
```
Given a free-production attempt that failed the gate (Again taken, word demoted)
When the learner submits a new sentence in the same review
Then the new sentence is unscored for this review
And the already-taken Again rating stands
And no second scheduler call is made for this presentation
```

**Notes / edge cases:** A transport-level inference retry on a network error is **not** a learner
signal and never touches the rating (`08`, `NET-*`).

### RAT-5 — Instrument richer signals from day one
**Trace:** PRD §3.6.
**Requirement:** Scaffolding, retry count, typo-fix, latency, and the cloze soft-bounce signals
(`softBounceCount` / `softBounceLanes`, `FIT-10`) MUST be instrumented and persisted from day one
even though v1 does not use them to rate, so the 4-button mapping can be enabled later (Deferred).
An unmeasured signal is recorded as absent, never as a fabricated 0/false.

---

## Scheduling separation & tier-regime

### RAT-6 — Scheduling is owned per word, separate from mastery (enforces `INV-3`)
**Trace:** PRD §2, §3.6.
**Requirement:** One FSRS card per word persists across tiers (`SM-2`); the FSRS internal `State`
MUST NOT be read as the mastery state, and vice versa. No manual tier-difficulty priors MUST be
injected — FSRS's per-card difficulty parameter adapts.

**Scenario: no manufactured "production is harder" prior**
```
Given a word climbing from recognition to free production
When the tier changes
Then no manual difficulty prior is injected into FSRS
And FSRS's own difficulty parameter adapts from observed ratings
```

**Notes / edge cases:** A tier change is a difficulty-regime change — one card spans recognition
(easy) → free production (hard), so a word stable at recognition can lapse on first production. v1
accepts this; recognition/cloze/cued ratings are low-value short-history signals and scheduling
becomes meaningful at the free-production tier.

### RAT-7 — `Seen` cloze-fail drop-back (cap = `SEEN_CLOZE_DROPBACK_CAP`)
**Trace:** PRD §3.6.
**Requirement:** A failed typed-cloze at `Seen` MUST be a deterministic-tier fail → reschedule, no
demotion, no LLM. Its **next** presentation MUST drop back to the meaning→word MCQ for one rep, then
re-attempt cloze. The drop-back MUST be capped at `SEEN_CLOZE_DROPBACK_CAP` (=1): if cloze fails
again, the word stays at `Seen` showing cloze with shorter FSRS intervals — no MCQ↔cloze ping-pong.

**Scenario: first cloze fail drops back to MCQ once**
```
Given a word at Seen failing the typed-cloze for the first time
When it is next presented
Then it shows the meaning→word MCQ for one rep
And no demotion occurred
And no LLM call was made
```

**Scenario: second cloze fail does not ping-pong**
```
Given a word at Seen that already used its one MCQ drop-back
When the cloze fails again
Then the word stays at Seen showing cloze
And FSRS intervals shorten
And it does NOT drop back to MCQ a second time
```

---

## Persistence

### RAT-8 — Log every `ReviewLog` from the first review
**Trace:** PRD §4.1, §8.
**Requirement:** The system MUST persist every FSRS `ReviewLog` from review #1, per user. It is the
sole input to parameter optimization and MUST NOT be reconstructed lazily. Rule-layer bounces (which
produce no rating, `RAT-2`) MUST NOT write a `ReviewLog`.

**Scenario: a rated review writes exactly one log; a bounce writes none**
```
Given a graded review that produced one rating
When the scheduler updates the card
Then exactly one ReviewLog is persisted
Given a rule-layer bounce in the same session
Then no ReviewLog is persisted for the bounce
```

**Notes / edge cases:** `ts-fsrs` runs server-side per user; a `Card` is a plain object with `Date`
fields persisted per user (`12`). `request_retention` = `REQUEST_RETENTION` (`09`); per-user
optimization at `PER_USER_OPT_REVIEW_THRESHOLD` reviews via
`@open-spaced-repetition/binding`; **no population-level optimization** (`09`).

---

## Open / to-validate (non-normative)

- Numeric sign-offs (`REQUEST_RETENTION` 0.90, all thresholds) — tune from real review data (PRD §11).

## Deferred (non-normative — [v2] / enable-later)

- **Full 4-button mapping** (`Again`/`Hard`/`Good`/`Easy`) per tier (PRD §3.6 table): scaffolded
  success → `Hard`; latency as an `Easy`-vs-`Good` tiebreaker on deterministic tiers only (never to
  manufacture `Again`); **length-scaled** cloze typo tolerance (Damerau–Levenshtein ≤1 for ≤6 chars,
  ≤2 longer) → `Hard` — the flat DL≤1 → `Good` rule is v1-live (`FIT-9`); "passed after synonym
  bounce" → `Hard` (`FIT-10`). Not active in v1; the signals are instrumented now (`RAT-5`).
