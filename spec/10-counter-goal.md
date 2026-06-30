# 10 — Gamification: Counter, Retrievability Gate & Daily Goal

**Purpose.** Specify the "words you can now use" counter (the app's headline value), its
retrievability gate, the expressive inline feedback, and the learner-set daily goal.

**Scope.** The gamification surface only — it attaches to the loop and adds no separate progression
system. Mastery progression is `01`; inline edit rendering is `07`.

**PRD trace.** §9; §11 item 11.

**Depends-on.** `00` (`INV-4`); `01` (`SM-5` Fluent superset); `02` (`get_retrievability`); `07`
(inline edits); `06` (judged passes).

**Out-of-scope.** Mastery ladder transitions (`01`), edit resolution (`07`).

---

### CNT-1 — Mastery progression is the visible, non-monotonic ladder
**Trace:** PRD §9, §3.
**Requirement:** Mastery progression MUST be the visible state ladder (`01`), tied to production
success, able to **regress** on failure/lapse. It MUST NOT be count-based or monotonic.

### CNT-2 — "Words you can now use" counter membership
**Trace:** PRD §9, §11 item 11; `INV-4`.
**Requirement:** A word MUST count toward the "words you can now use" counter when it has **≥
`COUNTER_MIN_SPACED_PASSES` (=2) spaced successful free *judged* productions** on **separate calendar
days** (user-local timezone). Recognition, cloze, and cued passes MUST NOT count (`INV-4`).

**Scenario: two spaced judged passes qualify a word**
```
Given a Productive word with 2 successful judged productions on 2 separate calendar days
And current retrievability ≥ COUNTER_R_FLOOR
When the counter is read
Then the word is included in the counter
```

**Scenario: deterministic passes do not qualify**
```
Given a word with 1 judged pass and several cued passes
When the counter is read
Then the word is NOT counted (cued passes do not count, INV-4)
```

### CNT-3 — Retrievability gate, evaluated live at read time
**Trace:** PRD §9.
**Requirement:** A word MUST stay in the counter while `get_retrievability(card, now) ≥
COUNTER_R_FLOOR` (=0.70), **evaluated live at read time** so it ticks down between reviews.
`COUNTER_R_FLOOR` MUST be **decoupled** from `REQUEST_RETENTION` (=0.90, `09`) — 0.90 is the
scheduling trigger; gating the headline metric there would make it jittery.

**Scenario: the counter ticks down as retrievability decays**
```
Given a counted word whose retrievability decays below COUNTER_R_FLOOR over time
When the counter is read at a later moment (no review in between)
Then the word is no longer included
And the counter value has ticked down
```

### CNT-4 — Counter is honest (can tick down), tied to current retrievability
**Trace:** PRD §9.
**Requirement:** The counter MUST be tied to current retrievability and MUST be allowed to **tick
down** when words lapse (honest, not vanity). It MUST NOT be a monotonic high-water mark.

### CNT-5 — Drift handled by ordinary demotion, not a special flag
**Trace:** PRD §9, §3.3, §6.
**Requirement:** A `Fluent` word whose sense has drifted MUST leave the counter via the **normal**
mastery/retrievability path: it fails its next maintenance review (judged every rep, `06`), demotes
(`SM-6`), and exits the counter. There MUST NOT be a special drift flag.

### CNT-6 — `Fluent` is a stricter superset of counter-eligibility
**Trace:** PRD §9, §3.2.
**Requirement:** The counter threshold (`COUNTER_MIN_SPACED_PASSES`=2) MUST be **lower** than the
`Fluent` threshold (`FLUENT_JUDGED_PASSES`=3, `SM-5`). A word enters the counter while merely
`Productive`-with-2-spaced-successes; `Fluent` is a superset.

**Scenario: a Productive word can be counted before it is Fluent**
```
Given a Productive word with exactly 2 spaced judged passes and retrievability ≥ COUNTER_R_FLOOR
When the counter is read
Then the word is counted
And the word is not yet Fluent (which requires 3, SM-5)
```

### CNT-7 — Expressive feedback renders inline edits; affirmation on correct
**Trace:** PRD §9, §5.6.
**Requirement:** When something was wrong, the surface MUST render the judge's `replacements`
**inline on the learner's own sentence** (strikethrough `find`, show `replace`, color-coded by
`reason`; tap reveals `one_line_feedback` on demand — `07`). When fully correct, it MUST affirm and
MAY offer `enrichment_suggestion` framed as an upgrade, not a fix. There MUST be no confetti.

### CNT-8 — Daily goal: learner-set, unit = productive uses
**Trace:** PRD §9, §11 item 11.
**Requirement:** The daily goal MUST be **set by the learner**, with unit = **productive uses** (free
judged productions; not minutes, not cards, not new introductions). Default
`DAILY_GOAL_DEFAULT` = 5, adjustable. It MUST be an **independent knob** from the §8 intro pace
(`SEED-9`), coinciding only numerically. The system SHOULD nudge toward a goal hittable ~6 days in 7.

**Scenario: a new introduction does not advance the daily-use goal**
```
Given a daily goal in units of productive uses
When a new word is introduced (a Seen interaction)
Then the daily-use goal progress does NOT advance
And only a free judged production advances it
```

### CNT-9 — No aggressive streaks
**Trace:** PRD §9.
**Requirement:** The surface MUST NOT use aggressive streaks (deliberate; avoids coercive
engagement).

---

## Open / to-validate (non-normative)

- Sign-off on `COUNTER_R_FLOOR` = 0.70 (PRD §9, §11).

## Deferred (non-normative — [v2] / enable-later)

- None.
