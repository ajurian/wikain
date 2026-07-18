# 14 — Mini-Sessions (Effort-Unit Batching)

**Purpose.** Specify the presentation of a review session as consecutive small **batches** sized by
time-anchored effort units, closed by a three-way cap, with a completion seam (Continue / Done)
after each batch, server-persisted absence handling (resume vs "Welcome back" rebuild), and the
instrumentation both need. Solves the "50-card wall": a ~50-card due queue presented as one wall is
a churn risk with no completion reward until the very end; the early reward lives at the batch seam.

**Scope.** Session **presentation only.** Ratings, scheduling, mastery transitions, evaluation, and
the upstream queue logic (due-sort + even new-card interleave, `SEED-6`/`LOOP-1`) are unchanged.
Batching owns no ratings, buffers nothing, and defers nothing: every rating hits FSRS immediately
per review exactly as before (`BAT-1`).

**PRD trace.** PRD Amendment v4.1 §12–§13 (2026-07-17). **This file is the amendment's normative
home** — the amendment scratch file is superseded and MUST NOT be cited (cite `BAT-n`).

**Depends-on.** `00` (`INV-1..4`); `02` (`RAT-5` — the instrument-don't-rate honesty pattern
`duration_ms` follows); `04` (`RL-6` — the capped-bounce reveal+skip that shrinks a batch); `08`
(`NET-2/3` — the no-rating network path and its skip); `09` (`SEED-6` — the day-guard's pacing
rationale); `10` (`CNT-8` — the daily goal shown at the seam); `11` (`LOOP-1` — the per-review loop
each batch card runs); `13` (`FIT-7` — soft bounces are rating-free, so they never tick).

**Out-of-scope.** The weight recompute from logged durations (Deferred, below); any change to queue
ordering beyond the single sanctioned FP deferral (`BAT-5`); a per-calendar-day cumulative
introduction ledger (Deferred — the day-guard in `BAT-14` is narrower).

**Why time-anchored units, not difficulty.** The unit measures *time/burden* only — difficulty is
FSRS's job, and letting difficulty leak into unit weights would re-introduce the manual
tier-difficulty priors the rating spec bars (`02`). Cued production therefore weighs the same as
cloze (same motor cost) even though its retrieval is harder.

---

## Batch construction

### BAT-1 — Batching is presentation-only pacing
**Trace:** Amendment §12.1, §A (invariant compatibility).
**Requirement:** Batching MUST NOT add an evaluator to any tier (`INV-1`), rate a bounce (`INV-2`),
touch mastery↔scheduling coupling (`INV-3`), or alter the counter (`INV-4`). Ratings MUST be logged
immediately per review, exactly as without batching; the batch MUST NOT buffer, defer, or alter a
rating. Completed reviews of an abandoned batch are real, permanent FSRS reviews.

**Scenario: an abandoned batch's completed reviews are permanent**
```
Given a learner has completed 2 reviews of a 6-card batch
When the learner abandons the session and the batch later expires (BAT-13)
Then the 2 persisted ReviewLogs and their FSRS state changes are untouched
And only the batch's remaining presentation state is discarded
```

### BAT-2 — Effort units are time-anchored per-tier weights
**Trace:** Amendment §12.2 `[DEFAULT]`.
**Requirement:** Each queue card MUST be weighted by its tier via the named constant map
`TIER_EFFORT_UNITS` (1 unit ≈ 10 s median engaged time; seed values: recognition 1, cloze 2,
cued 2, free 10). Weights are global (not per-user — this is UX pacing, not scheduling, so pooling
does not violate the per-user-only rule governing FSRS parameters) and MUST NOT encode retrieval
difficulty. The free-production weight prices in the judge round-trip and reading the
verdict/`replacements` — feedback reading is part of the interaction.

**Scenario: weights come from the constant map**
```
Given a queue of one free-production card and one recognition card
When a batch is constructed
Then the free card contributes TIER_EFFORT_UNITS.free units and the MCQ card TIER_EFFORT_UNITS.recognition
```

### BAT-3 — Three caps; first hit closes the batch
**Trace:** Amendment §12.3 `[DEFAULT]`.
**Requirement:** A batch MUST close on whichever cap hits first: `BATCH_UNIT_BUDGET` (units),
`BATCH_CARD_CAP` (cards — guards light-card monotony: 20 rapid MCQs is time-cheap but fatiguing),
`BATCH_FP_CAP` (free productions — guards (a) one batch swallowing the daily goal and (b)
mature-deck drift, where retained users' queues become FP-heavy; the cap spills excess FPs into
later batches interleaved with lighter cards, keeping "mini" true for exactly the users most
exposed).

**Scenario: the card cap binds on an all-MCQ queue**
```
Given a queue of 15 due recognition cards (15 units total, under the unit budget)
When a batch is constructed
Then the batch holds exactly BATCH_CARD_CAP cards
```

**Scenario: the FP cap binds on an FP-heavy queue**
```
Given a queue whose first three cards are free-production (10 units each)
When a batch is constructed
Then the batch holds exactly BATCH_FP_CAP free-production cards
```

### BAT-4 — Deterministic in-order greedy fill; over-budget closes; lone over-budget admitted
**Trace:** Amendment §12.4 `[DECIDED]`.
**Requirement:** `build_batch` MUST walk the queue **in order** — never reordering to pack the
budget (queue order is pedagogy; the budget is pacing) — appending cards until a cap closes the
batch. A card whose weight would exceed `BATCH_UNIT_BUDGET` MUST close the batch, EXCEPT into an
empty batch, where it MUST be admitted (so a single free production can always be served).
Construction is deterministic: the same queue yields the same batch.

**Scenario: an over-budget card closes a non-empty batch**
```
Given a batch holding 12 units
And the next queue card is free-production (10 units)
When construction considers it
Then the batch closes at 12 units and the FP card leads the next batch
```

**Scenario: a lone over-budget card is admitted into an empty batch**
```
Given BATCH_UNIT_BUDGET of 20 and a hypothetical card weighing more than the budget
When construction begins a fresh batch with that card at the queue head
Then the card is admitted as the batch's first card
```

### BAT-5 — FP deferral in place: the sole sanctioned order bend
**Trace:** Amendment §12.4 `[DECIDED]` (signed off consciously; the alternative — never bend
order — yields consecutive FP-only batches on mature decks, honest but grindy).
**Requirement:** A free-production card encountered when the batch already holds `BATCH_FP_CAP`
free productions MUST be **deferred, not dropped**: it keeps its queue position and joins a later
batch. No other tier and no other rule may bend queue order.

**Scenario: the third consecutive FP defers in place**
```
Given a queue beginning FP1, FP2, FP3, MCQ1 and BATCH_FP_CAP = 2
When a batch is constructed
Then the batch is [FP1, FP2, MCQ1]
And the next batch begins with FP3 (its queue position was kept)
```

### BAT-6 — Remainder batches present at natural size
**Trace:** Amendment §12.4.
**Requirement:** When the queue is exhausted below every cap, the batch MUST present at its natural
smaller size ("3 cards left" framing). The progress bar MUST NOT be padded.

**Scenario: three cards left**
```
Given a remaining queue of 3 cards totaling 5 units
When a batch is constructed
Then the batch holds 3 cards and its progress denominator is 3
```

---

## Batch lifecycle

### BAT-7 — Progress ticks iff a rating was logged
**Trace:** Amendment §12.5-1 `[DECIDED]`; `INV-2`; `FIT-7`.
**Requirement:** Batch progress MUST increment exactly when a review's interaction persisted a
`ReviewLog`. Rule-layer bounces (`RL-*`), cloze soft bounces (`FIT-7`), and network no-ratings
(`NET-3`) consume time but MUST NOT tick the bar — the bar and FSRS ground truth stay in lockstep.
Because the rule keys off "was a rating logged," any interaction defined as rating-free is
automatically excluded with no batch-side special-casing. Every such interaction (ticking or not)
MUST refresh the session's last-interaction timestamp (`BAT-11`).

**Scenario: a soft bounce does not tick**
```
Given a 5-card batch at progress 2/5 presenting a cloze card
When the learner's submission soft-bounces (FIT-7: no ReviewLog)
Then progress remains 2/5
And the session's last-interaction timestamp is refreshed
```

**Scenario: a judged pass ticks**
```
Given the same batch at 2/5 presenting a free-production card
When the submission is judged and a ReviewLog is persisted
Then progress becomes 3/5
```

### BAT-8 — Terminal skips shrink the batch
**Trace:** Amendment §12.5-2; `RL-6`; `NET-3`.
**Requirement:** A terminal rule-layer outcome (the `RL-6` capped reveal+skip) and a
persistent-network-failure skip MUST remove the card from the batch **without crediting units or
ticking progress** — the denominator shrinks, so the bar cannot stall short of N forever. The
judge-unavailable state (`NET-3`) MUST offer a skip affordance alongside its neutral retry message
(the card stays due; no rating — `INV-2` untouched).

**Scenario: a capped bounce shrinks the batch**
```
Given a 5-card batch at progress 2/5
When the learner's third rule-layer bounce triggers the RL-6 reveal and skip
Then the card leaves the batch and the batch becomes 2/4
And no ReviewLog is persisted for it
```

### BAT-9 — The completion seam: beat, summary, explicit choice
**Trace:** Amendment §12.5-3 `[DEFAULT]`; `CNT-8`.
**Requirement:** At N/N the UI MUST present a completion beat (affirmation + batch summary, e.g.
"3 words produced, 1 promoted") followed by an explicit **Continue / Done** choice. If due cards
remain, Continue MUST trigger a fresh batch build over the remaining queue. Daily-goal progress
(`CNT-8`) MUST be shown **at the seam only** — never as a second live meter during cards (two
meters with different units would compete).

**Scenario: the seam appears with the choice**
```
Given a batch reaches N/N with due cards remaining
When the seam renders
Then a batch summary and the daily-goal progress are shown
And the learner is offered Continue and Done
And no daily-goal meter was visible during the cards
```

### BAT-10 — The active batch is immutable; newly-due cards wait
**Trace:** Amendment §12.5-4.
**Requirement:** Cards that become due mid-session MUST join the queue for **future** batches only;
the active batch's membership MUST NOT grow (it shrinks only via `BAT-8`). Each seam rebuild
(`BAT-9`) re-reads current due state, which is how newly-due cards enter.

**Scenario: a mid-batch newly-due card waits for the next build**
```
Given an active 4-card batch in progress
When another card becomes due
Then the active batch still holds its original cards
And the card is eligible for the batch built at the next seam
```

---

## Absence handling

### BAT-11 — Session state is server-side; one two-branch check; connectivity decoupled
**Trace:** Amendment §12.6 `[DECIDED]` (mechanism).
**Requirement:** Batch/session presentation state (the active batch's card list, progress index,
last-interaction timestamp) MUST be persisted server-side, so an app kill / cold start resolves
through the same two-branch check (`BAT-12`/`BAT-13`) — no third code path, and no silent in-memory
reset masquerading as an expiry. Absence is measured from **last user interaction**
(`BATCH_ABSENCE_T_MINUTES`). Network loss MUST NOT trigger any batch reset: a failed judged card
already produced *no rating, card stays due* (`NET-3`/`INV-2`), so the batch counter was never
incremented for it and is already accurate.

**Scenario: a cold start resolves through the same check**
```
Given an active batch at 2/5 persisted server-side
When the app is killed and relaunched within the absence window
Then the same resume-or-rebuild check runs as for an in-app return
And the batch resumes at 2/5
```

### BAT-12 — Return within T resumes at true progress
**Trace:** Amendment §12.6.
**Requirement:** A return within `BATCH_ABSENCE_T_MINUTES` of the last interaction MUST resume the
active batch at its true progress (including resume-to-seam when N/N was reached but the
Continue/Done choice was not yet made). The boundary is inclusive: a return at exactly T resumes.

**Scenario: resume mid-batch**
```
Given an active batch at 2/5 and a last interaction 15 minutes ago
When the learner returns
Then the batch presents its third card at 2/5
```

### BAT-13 — Return after T rebuilds; never render a reset
**Trace:** Amendment §12.6 `[DECIDED]`.
**Requirement:** On a return after `BATCH_ABSENCE_T_MINUTES`, the stale batch's remaining
presentation state MUST be discarded (**logged ratings are untouched and untouchable**), its
instrumentation row finalized as abandoned (`BAT-16`), the queue rebuilt from current due state
(re-sort, re-interleave under the `SEED-6` pacing rules — a crossed day boundary changes the
new-card budget via `BAT-14`), a fresh batch built, and the session presented as
**"Welcome back — 0/M."** The old bar MUST never be shown going backwards; the old batch simply no
longer exists. Rationale: after a long absence the stale artifact is the *queue*, not the counter —
a visible 2/N → 0/N reset punishes returning, the exact moment to reward.

**Scenario: welcome back after expiry**
```
Given an active batch at 2/5 whose last interaction exceeds the absence window
When the learner returns
Then a fresh batch is built from current due state and presented as 0/M with welcome-back framing
And the two logged ratings from the stale batch are untouched
And the stale batch's 2/5 bar is never rendered
```

### BAT-14 — Rebuilds seed introductions at most once per learner-local day, and never within the min gap
**Trace:** `SEED-6` (pacing is per-day, not per-build); `SEED-10..14` (the calendar-day + min-gap rail
is the normative home); Amendment §12.6 (the day-boundary note) + Amendment v4.2 (the min-gap clause).
**Requirement:** A queue (re)build MUST run introduction seeding only when **both** `SEED-10` clauses
hold — the learner-local day (the `CNT` day-boundary convention) has rolled since seeding last ran for
this user **AND** at least `SEED_MIN_GAP_HOURS` have elapsed since it. A same-day rebuild — seam,
T-expiry, reload, or a fresh session after Done — MUST order existing cards only; so MUST a new-day
rebuild that falls within the min gap (the 11:50pm→12:00am boundary burst). The seeding fact is a
pacing ledger fact, not presentation state: it MUST be persisted as an absolute instant (`SEED-11`),
separately from the discardable batch state, and survive both the `BAT-13` replacement and a session's
Done-clear.

**Scenario: a T-expiry rebuild does not re-seed same-day**
```
Given seeding ran this learner-local day and a batch then expired (BAT-13)
When the welcome-back rebuild runs
Then no new introduction cards are created
And the rebuilt queue contains only already-existing due cards
```

**Scenario: a crossed day boundary re-enables seeding (when the gap has also elapsed)**
```
Given seeding last ran yesterday in the learner's timezone (≫ SEED_MIN_GAP_HOURS ago)
When any rebuild runs today
Then introduction seeding runs under the SEED-6 pacing caps before ordering
```

**Scenario: a new day within the min gap does NOT re-seed (SEED-10 clause b)**
```
Given seeding ran at 11:50pm learner-local
When a rebuild runs at 12:00am (a new calendar day, ten minutes later)
Then no new introduction cards are created (the min-gap clause blocks it)
```

---

## Instrumentation (from day one — cheap now, impossible to retrofit)

### BAT-15 — Per-review `duration_ms`
**Trace:** Amendment §12.2, §12.7; `RAT-5` (the persist-but-do-not-rate honesty pattern).
**Requirement:** Every persisted `ReviewLog` MUST carry an optional `duration_ms`: card-shown →
gradeable outcome, **including** the judge wait (the learner experiences it; on the free tier the
client-measured span is extended by the judge-call elapsed the server already measures). It feeds
the Deferred weight recompute; v1 MUST NOT rate or batch on it. An unmeasured duration MUST
round-trip as absent — never a fabricated 0 (the `RAT-5` honesty rule). A card re-shown after a
resume (`BAT-12`) restarts the clock: pre-absence viewing time is unmeasurable after a cold start
and would be walk-away-contaminated anyway. `duration_ms` is distinct from `latencyMs` (`RAT-5`:
submit → gradeable outcome), which keeps its own semantics.

**Scenario: a graded review records its duration**
```
Given a cloze card shown to the learner
When the learner submits after 18 seconds and the review is graded
Then the persisted ReviewLog carries duration_ms ≈ 18000
```

**Scenario: an unmeasured duration stays absent**
```
Given a review submitted by a caller that captured no timing
When the ReviewLog is persisted and read back
Then duration_ms is absent (not 0)
```

### BAT-16 — Per-batch instrumentation row
**Trace:** Amendment §12.7.
**Requirement:** Each built batch MUST create an instrumentation row recording its planned
composition (per-tier counts), planned units, planned card count, and build time. On finalization
the row MUST record: completed vs abandoned, completed-review count, abandonment position and that
card's tier (when abandoned), wall-clock duration, and the Continue/Done seam choice (absent when
the learner never chose). Finalization MUST be idempotent (a row finalizes once). These enable the
hypothesis tests the amendment names: high Continue-rate ⇒ batches work as commitment devices;
Done-after-batch-1 with churn below baseline ⇒ the early-reward framing worked; mid-batch
abandonment concentrated on FP cards ⇒ the FP weight or `BATCH_FP_CAP` is wrong.

**Scenario: an expired batch finalizes as abandoned at its true position**
```
Given a 5-card batch abandoned at progress 2 with a free-production card next
When the BAT-13 rebuild finalizes it
Then its row records outcome abandoned, completed 2, abandonment position 2, tier free
And no seam choice is recorded
```

**Notes / edge cases:** a never-returning abandoner's row stays open until the next return
finalizes it; analytics MUST treat open-and-stale rows as abandoned.

---

## Open / to-validate (non-normative)

- `[VALIDATE]` `BATCH_ABSENCE_T_MINUTES = 20` is a guess inside a 15–30 min band; instrument
  time-to-return and set T at a natural gap in the observed distribution.
- `[VALIDATE]` Seed weights vs trimmed `duration_ms` medians once a tier has ≥ ~200 pooled logged
  reviews; reconsider including the judge wait in `duration_ms` if DeepSeek TTFT variance pollutes
  the FP weight.
- `[VALIDATE]` `BATCH_FP_CAP = 2` vs mid-batch FP-abandonment data; `BATCH_CARD_CAP = 10` vs
  light-batch completion rates.
- **Seam abandonment reads as churn (measurement risk):** the explicit Done choice will *increase*
  measured session-exit events by design (exits now have a sanctioned place). Compare retention
  against the pre-batch baseline on **return-rate and words-produced**, not session length, or the
  feature will look like a regression it isn't.

## Deferred (non-normative — [v2] / enable-later)

- **Weight recompute from logged durations** (Amendment §12.2): once a tier has ≥ ~200 pooled
  reviews, recompute `weight = round(trimmed_median_duration / 10 s)`, clamp to `[1, 12]`, refresh
  weekly. **Trim the distribution** (cap single observations at 5 min, or use the 40th
  percentile) — walk-away contamination otherwise drifts the FP weight upward forever, and the
  feedback loop can oscillate (walk-aways inflate the FP weight → fewer FPs per batch → more
  attention per FP → durations rise further); the clamp and the trimmed median bound this — keep
  both. Weights stay global. `duration_ms` (`BAT-15`) is instrumented now so no signal is lost.
- **`BATCH_ABSENCE_T_MINUTES` retuning** from the observed time-to-return distribution.
- **A true per-calendar-day cumulative introduction *count* ledger** (`SEED-6`): `BAT-14`/`SEED-10`
  now guard *whether* a build seeds — a new day AND a min-gap since the last seed, which closes the
  boundary-burst — but still not *how many* introductions a day admits across builds; the cumulative
  count cap remains deferred (PRAG-1).
- **Deferral-starvation dashboard check:** a queue whose head is > `BATCH_FP_CAP` consecutive FPs
  defers FPs batch after batch; pathological only if the queue is nearly FP-pure, in which case
  batches degrade to 2-FP-only batches — acceptable, but worth a dashboard check on mature decks.
