# 15 — Cued-Production Synonym Soft Bounce

**Purpose.** Specify the same-sense synonym **soft-bounce** lane for the **cued-production** tier: the
cued-specific `cued_valid_synonyms` set, the four-lane deterministic grade order with its no-rating
soft bounce, the cap-then-reveal termination, and the instrumentation. It is the cued parallel of the
typed-cloze fit set (`spec/13`) — a **parallel class, not a shared code path**.

**Scope.** The **cued-production tier only** (`TIER-3`/`TIER-5`, the `Recognized → Productive` step).
Recognition, cloze, and free production are untouched. Cued remains deterministic: no LLM, no network
beyond the single existing NLP `analyze` call (`CUE-8`).

**PRD trace.** PRD v4 §3.2, §3.3, §3.6, §4, §4.1 — patched by decision item 17 (Amendment v4.3). **This
file is the normative home** of the cued synonym lane; where the PRD text or Amendment v4.3 prose
differ, this file's `CUE-n` IDs win.

**Depends-on.** `00` (`INV-1..4`); `02` (`RAT-1/5`); `03` (`TIER-3/5` — the target lane IS the lemma
match); `12` (`DM-2` — `cued_valid_synonyms` rides the lexical item); `13` (`FIT-6/7/8` — the cloze
soft-bounce class this one parallels, and the shared `damerauLevenshtein`).

**Out-of-scope.** The separate `CUE-11` instrumentation *stream* (Deferred, below — v1 folds the count
into the ReviewLog); the free-production judge (`06`); any demotion (cued is at the `Recognized` floor).

**Why this exists.** Cued hard-graded by lemma match against the **single target**, so a
meaning-correct **synonym** (learner types *prison* for target *jail*) produced an `Again` — a false
negative on well-formed input, the same class `FIT-7` soft-bounces for cloze. Left as `Again` it
reschedules the word off a signal that is not a memory lapse. Cued does **not** demote (§3.3), so this
never corrupts mastery, but it distorts scheduling and punishes a near-success. `CUE-n` closes that gap
for cued, respecting that cued has **no sentence frame** — so it needs its own set, not the cloze one.

---

## Build-time content (the synonym set is catalog data)

### CUE-1 — Cued gains a same-sense synonym soft-bounce lane
**Trace:** PRD §3.6; Amendment v4.3 decision item 17 `[DECIDED]`.
**Requirement:** On a cued-production attempt, a response that is a **valid same-sense synonym of the
target** (not the target itself) MUST produce a **soft bounce** rather than an `Again`. This is a
**third grading class** for cued, distinct from a pass and from a fail, parallel to the cloze
soft-bounce class (`FIT-7`) but never sharing its code path.

**Scenario: a meaning-correct synonym is not a fail**
```
Given a cued card for target lemma "jail" whose cued_valid_synonyms lists "prison"
When the learner types "prison"
Then the response resolves to the synonym lane
And a soft bounce is surfaced (no rating, no reschedule)
And no judge/LLM call is made
```

### CUE-2 — The synonym set is cued-specific and built against the gloss, NOT the cloze fit set
**Trace:** PRD §4 / §4.1; Amendment v4.3 `[DECIDED]`.
**Requirement:** Cued MUST use its **own** acceptable-synonym set, enumerated against the **intended
sense + POS + productive gloss**. It MUST NOT inherit `cloze_fit_set`. The cloze fit set is a property
of **(word, sentence-frame)**; cued has no frame, so a frame-enumerated set is neither **sound** (its
entries were chosen against the sentence, not the meaning) nor **complete** (it omits valid cued
synonyms the frame never needed) for cued. This **reverses** the earlier PRD §4/§4.1 clause "cued does
not inherit the fit-set"; the reversal changes *what set cued consults*, not the reason the clause
existed (cued has no frame).

> **[FLAG] v1 bootstrap deviation.** v1 seeds `cued_valid_synonyms` from the `same_sense_near_miss`
> entries of `cloze_fit_set` via a one-time derivation script. Those entries **are** genuine same-sense
> synonyms, so the seed is **sound** (no false positives), but it is **frame-derived** — hence
> potentially **incomplete** and, until re-generated, **coupled** to the cloze frame (against `CUE-9`).
> This is an accepted stopgap, backfilled by proper gloss-enumeration at the next generation pass (the
> `CUE-11` "watch for fall-through, backfill" ethos). Future generation authors the set against the
> gloss per `CUE-3`.

### CUE-3 — Generation home: the offline build-time content pass
**Trace:** PRD §4.1 (catalog content, layer 1); Amendment v4.3 `[DECIDED]`.
**Requirement:** The set is produced **once, offline, in batch**, in the same content pass that
generates the cloze fit set, distractors, and cued prompts. Each lexical item gains a generated field
`cued_valid_synonyms: string[]` — lemmas of same-sense synonyms of the target, enumerated against the
intended sense + POS + gloss. `[]` when the sense has no good same-sense synonym. There is **no runtime
generation** and **no LLM at grade time** (`CUE-8`). It is validated at Stage C (present, distinct,
never the target lemma, never an MCQ distractor) and is **catalog content** — shared across users,
never per-user.

**Scenario: a built item carries a well-formed synonym set**
```
Given a Stage-B generated item for target lemma "jail"
When Stage C validates it
Then cued_valid_synonyms is a list of distinct lemmas
And it does not contain "jail"
And no entry also appears in the item's distractors
```

### CUE-4 — Same-sense only; `different_sense_fit` is excluded by construction
**Trace:** PRD §4.1 (multisense — each WordNet sense is its own item); Amendment v4.3 `[DECIDED]`.
**Requirement:** `cued_valid_synonyms` MUST contain **only same-sense** synonyms for the item's
intended sense/POS. The cloze `different_sense_fit` class MUST NOT be carried over: at cued the whole
task is producing the target form **for the target meaning**, so a different-sense word is a **wrong
retrieval**, not a tolerable near-miss. No entry MUST equal an MCQ distractor (the recognition MCQ
taught "not this word for this meaning"; accepting it at cued would contradict that lesson).

**Scenario: a different-sense word is a wrong retrieval, not a soft bounce**
```
Given a cued card for "jail" whose distractors include "hospital"
When the learner types "hospital"
Then the response resolves to the wrong path (Again), never the synonym lane
```

### CUE-9 — Tier decoupling (the maintainability reason for a separate set)
**Trace:** PRD §4; Amendment v4.3 `[DECIDED]`.
**Requirement:** Because `cued_valid_synonyms` is generated against the gloss and stored on the lexical
item **independently of the cloze frame**, regenerating or editing a cloze sentence during content
iteration MUST NOT silently change cued grading. This keeps cued and cloze as the **separate difficulty
regimes** the PRD intends and avoids re-coupling two tiers through shared content. *(The `CUE-2` `[FLAG]`
bootstrap is the one temporary exception, resolved at the next generation pass.)*

---

## Runtime — the four-lane deterministic path

### CUE-5 — Grade order at cued is a fixed-precedence lookup (deterministic)
**Trace:** PRD §3.6; `TIER-5` (the target lane IS the lemma match); Amendment v4.3 `[DECIDED]`.
**Requirement:** On cued submit, over the tokens from the one NLP `analyze` call, the response MUST be
graded by lane resolution in this precedence:

| Response is… | Lane | Rating |
| --- | --- | --- |
| a lemma-match of the target (inflection-agnostic) | target pass | `Good` — promotes `Recognized → Productive` (§3.2) |
| within Damerau–Levenshtein ≤ `CUED_TYPO_MAX_DISTANCE` of the target (§3.6 typo-fix) | typo pass | `Good`, `typoFixed` recorded |
| a lemma-match of a `cued_valid_synonyms` member | soft bounce | **no rating** (`CUE-6`) |
| none of the above | wrong path | `Again` — reschedules, **no demotion** (§3.3) |

A soft bounce is **not** a pass: the word stays `Recognized`, no promotion (`CUE-5.2`). The `Again` path
is an ordinary deterministic-tier fail: reschedules (FSRS), never demotes (`CUE-5.3`, cued is at the
`Recognized` floor).

> **[FLAG] precedence vs. `FIT-6`.** Target-typo precedes the synonym lane (this table's order), the
> inverse of the cloze rule where fit-set membership beats typo distance (`FIT-6`). A curated same-sense
> synonym that is *also* within one edit of the target is therefore graded as a target typo (`Good`)
> rather than a soft bounce — a rare, benign case (the learner produced the target's near-form and
> demonstrated the skill), so the Amendment's step order is kept as written.

**Scenario: a same-sense synonym soft-bounces, not passes**
```
Given a cued card for "jail" whose cued_valid_synonyms lists "prison"
When the learner types "prison"
Then the synonym lane resolves
And no rating is derived and the word stays Recognized
```

**Scenario: a typo of the target still passes**
```
Given a cued card for target lemma "negotiate"
When the learner types "negotiat" (DL distance 1)
Then the typo-fix lane resolves
And the rating is Good and the ReviewLog records typoFixed = true
```

### CUE-6 — Soft-bounce semantics (mirrors `FIT-7`)
**Trace:** `INV-1/2/3/4`; `FIT-7` (the parallel class); Amendment v4.3 `[DECIDED]`.
**Requirement:** A cued soft bounce MUST make **no scheduler call, derive no rating, persist no
ReviewLog, and leave the card due**. It is a class **distinct from an `INV-2` rule-layer bounce** — the
input is *well-formed* — sharing `INV-2`'s consequence but not its definition; it MUST NOT be folded
into the rule-layer bounce counter. Invariants are preserved: `INV-1/2/3` (no rating → no review, no
phantom lapse; scheduling and mastery untouched); `INV-4` (cued never counts toward the counter or
`Fluent` regardless). `BAT-7`: session progress ticks **iff a ReviewLog was persisted** — a cued soft
bounce persists none, so it consumes session time but does **not** advance the bar, identical to a
cloze soft bounce.

**Scenario: a soft bounce never touches the scheduler**
```
Given a cued submission resolving to the synonym lane under the cap
When the soft bounce is handled
Then no rating is derived
And scheduler.next is NOT invoked
And no ReviewLog is persisted
And the card remains due
```

### CUE-7 — Soft-bounce termination: cap, then reveal → `Again`
**Trace:** `FIT-8` / `RL-6` (the cap-then-reveal pattern this mirrors); `INV-1`; Amendment v4.3
`[DEFAULT]` + `[VALIDATE]`.
**Requirement:** Cued soft bounces MUST cap at `CUED_SOFT_BOUNCE_CAP` (`[DEFAULT]` = the cloze
`CLOZE_SOFT_BOUNCE_CAP` value = 3) per presentation. On the cap-th synonym bounce the submission MUST
grade the wrong path (`Again`, no demote) and the target MUST be revealed. The presentation owns
per-presentation soft-bounce state and passes it in (the use-case stays stateless, as with `FIT-8`
`priorSoftBounces`). A learner who reaches the target (or a typo of it) within the cap rates `Good` on
that final outcome (`INV-1` — one presentation, one rating on the final gradeable outcome).

> **[VALIDATE]** The alternative — nudge on the *first* synonym → reveal → accept a **scaffolded**
> `Good` (a second pass path) — is the pedagogically richer option and the likely v2 move if synonym
> bounces prove common. v1 ships the cap→reveal+`Again` mechanism (reuses an existing pattern); decide
> against real synonym-bounce frequency from the `CUE-11` signal.

**Scenario: cap exhaustion reveals and rates Again**
```
Given a presentation that has soft-bounced twice (CUED_SOFT_BOUNCE_CAP = 3)
When the learner submits a third valid synonym
Then the outcome rates Again (no demotion — cued is at the Recognized floor)
And the target word is revealed
```

### CUE-8 — Determinism and cost preserved
**Trace:** PRD §4 (cued is deterministic); Amendment v4.3 `[DECIDED]`.
**Requirement:** No LLM, no extra network call. Cued already issues the one NLP `analyze` call for its
target lemma match; the synonym check MUST be an **in-process set-membership test** over that same
analysis (`formsOf` over the returned tokens). Zero added runtime cost or billable calls.

### CUE-10 — American forms accepted
**Trace:** PRD §4.1 (`en-US` edition); Amendment v4.3 `[DECIDED]`.
**Requirement:** `cued_valid_synonyms` and its match MUST accept American spellings/forms, consistent
with the `en-US` edition, so an American-spelled synonym is not mis-bounced (spaCy does not Americanize,
so no target/synonym lemma is unrepresentable).

---

## Instrumentation

### CUE-11 — Instrument the synonym-bounce signal from day one
**Trace:** `RAT-5` / `FIT-10` (the persist-but-do-not-rate pattern); Amendment v4.3 `[DEFAULT]`.
**Requirement:** The synonym-bounce signal MUST be instrumented from first release. v1 records
`softBounceCount` (synonym bounces accrued this presentation, `0` when none) on the final graded
cued ReviewLog — the same pattern as the cloze `FIT-10` soft-bounce count — so the Deferred 4-button
mapping can later map "passed after synonym bounce" → `Hard`. v1 MUST NOT rate on it. Cued has a single
synonym lane, so it records the **count** alone and omits the cloze-typed `softBounceLanes`.

**Scenario: a converted pass records its bounce history**
```
Given a presentation that soft-bounced once on the synonym lane
When the learner then types the target and the review is graded
Then exactly one ReviewLog is persisted
And it records softBounceCount = 1
And the rating is Good (the history did not alter the v1 rating)
```

---

## Open / to-validate (non-normative)

- `[VALIDATE]` **`CUE-7` terminal behavior** — cap→reveal+`Again` (v1) vs. nudge→scaffolded-pass;
  decide against synonym-bounce frequency.
- `[VALIDATE]` **`cued_valid_synonyms` completeness** — a valid synonym *not* in the set still
  hard-`Again`s (there is no live escalation, mirroring `FIT-11`'s accepted first-hit cost). Watch for
  valid synonyms falling through to `Again`; backfill the set at the next build pass.
- `[VALIDATE]` sign-off on `[DEFAULT]` `CUED_SOFT_BOUNCE_CAP` (= cloze cap value).

## Deferred (non-normative — [v2] / enable-later)

- **The separate `CUE-11` instrumentation stream** — a per-soft-bounce log of the *produced synonym* +
  target (a dedicated store, parallel to the cloze heal queue), for set-quality monitoring and the
  `CUE-7` a-vs-b sign-off. v1 folds the **count** into the ReviewLog (`CUE-11`); the standalone
  produced-synonym stream follows once a signal is needed.
- **`cued_valid_synonyms` gloss-enumeration at generation** replacing the `CUE-2` `[FLAG]` bootstrap —
  the generation prompt asks for it (`CUE-3`); the next full generation pass authors it against the
  gloss and supersedes the frame-derived seed.
- **"Passed after synonym bounce" → `Hard`** — part of the Deferred 4-button mapping (`02`); the signal
  is instrumented now (`CUE-11`).
