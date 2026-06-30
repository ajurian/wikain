# 11 — End-to-End Loop (one pass)

**Purpose.** Specify the single-pass orchestration that composes all subsystem specs — schedule →
tier select → respond → (deterministic grade | rule layer → memo → judge → verdict) → derive rating
→ persist. This is the **integration spec**; each branch asserts which downstream specs fire and
which are skipped.

**Scope.** Orchestration only. Each step's internal rules live in its owning spec; this file binds
them in order and asserts the wiring.

**PRD trace.** §10; §6.

**Depends-on.** All of `00`–`10`, `12`.

**Out-of-scope.** Internal rules of each step (owned elsewhere).

---

### LOOP-1 — Pass ordering
**Trace:** PRD §10.
**Requirement:** One loop pass MUST proceed in this order: (1) FSRS surfaces a due word; (2) the
word's mastery state selects the tier (`01`/`03`); (3) the learner responds; (4) deterministic tiers
grade-and-derive-rating and end the pass; judged tiers continue through rule layer → memo → judge →
verdict; (5) derive rating and persist the `ReviewLog` (`02`).

### LOOP-2 — Deterministic branch ends the pass with no LLM
**Trace:** PRD §10 step 3.
**Requirement:** For recognition/cloze/cued, the system MUST grade deterministically, derive the
rating (`02`), update FSRS, possibly promote (`Seen→Recognized` on a cloze pass following a prior MCQ
pass; `Recognized→Productive` on a cued pass), and **end the pass with no LLM call**.

**Scenario: a cloze pass promotes and ends the pass**
```
Given a word at Seen showing the typed-cloze, with a prior MCQ pass
When the learner passes the cloze
Then it is graded deterministically (no LLM)
And the rating Good is applied and FSRS updates
And the word promotes Seen → Recognized
And the pass ends
```

### LOOP-3 — Judged branch order: rule layer → memo → judge → verdict
**Trace:** PRD §10 steps 4–7.
**Requirement:** For free production / maintenance, the system MUST run the rule layer (`04`) first; a
bounce ends the pass with **no rating, no FSRS update** (`INV-2`). On pass it MUST consult the memo
(`05`) — a hit returns the stored verdict; a miss invokes the judge (`06`). The verdict MUST then
drive promote-or-demote.

**Scenario: a rule-layer bounce ends the judged pass with no rating**
```
Given a free-production submission bounced by the rule layer (absent/degenerate/Taglish)
When the bounce is handled
Then no rating is derived and no FSRS update occurs (INV-2)
And the memo and judge are NOT consulted
And the card stays due
```

**Scenario: a memo hit skips the judge**
```
Given a rule-layer-passed submission whose memo key matches a stored verdict
When the memo is consulted
Then the stored verdict is used
And no judge/LLM call is made
And the pass proceeds to verdict handling with that verdict
```

### LOOP-4 — Verdict: pass promotes; fail rates Again + demotes (first genuine fail)
**Trace:** PRD §10 step 7.
**Requirement:** On a **pass** (sense-correct AND grammatical, `06`) the system MUST promote one rung
(`01`) and render a green check plus any non-failing `replacements`/enrichment inline (`07`/`10`). On
a **fail** the rating MUST be taken on this **first genuine gate fail** (`Again` + demote, `01`/`02`);
feedback + `replacements` are shown; further sentences are **unscored** for this review (served from
memo where identical — never re-judged). There MUST be no override and no rejudge (`06`).

**Scenario: a judged pass promotes and renders inline edits**
```
Given a rule-layer-passed free production judged sense-correct and grammatical
When the verdict is handled
Then the word promotes one rung
And a green check plus any non-failing replacements/enrichment render inline
And the rating Good is applied
```

**Scenario: a judged fail demotes and freezes the rating**
```
Given a free production judged a sense or grammar fail
When the verdict is handled
Then the rating Again is taken on this first genuine gate fail
And the word demotes one rung (floor Recognized)
And any further sentence in this review is unscored
And no override or rejudge is available
```

### LOOP-5 — Persist exactly on rated outcomes
**Trace:** PRD §10 step 8.
**Requirement:** After a rating is derived, the system MUST call the scheduler and persist the
`ReviewLog` (`02`/`RAT-8`). Rule-layer bounces (step 4) MUST be skipped here — they produced no
rating (`INV-2`).

**Scenario: a rated pass persists one log; a bounce persists none**
```
Given a judged free production that produced a rating
When the pass completes
Then the scheduler is called and exactly one ReviewLog is persisted
Given a rule-layer bounce earlier in the session
Then no ReviewLog was persisted for that bounce
```

---

## Notes / edge cases

Maintenance follows the **same** judged branch (it re-applies free production, judged every rep —
`06`/`JDG-8`); a maintenance sense-fail demotes synchronously on the presentation just made.

## Deferred (non-normative — [v2] / enable-later)

- None (orchestration only; deferred behaviors live in their owning specs).
