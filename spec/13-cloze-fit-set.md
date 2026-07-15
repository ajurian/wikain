# 13 — Typed-Cloze Fit-Set & Soft Bounce

**Purpose.** Specify the classified `cloze_fit_set` (the graded handling of non-target-but-valid
words on the typed cloze tier), the three-lane deterministic runtime path with its no-rating soft
bounces, the typo-fix lane, the instrumentation, and the runtime half of the offline heal queue.

**Scope.** The **typed cloze tier only** (`TIER-1` row 2). Recognition, cued, and free production
are untouched — the fit set is enumerated against the cloze sentence frame, so it cannot transfer
to cued (no frame). Cloze remains deterministic: no LLM, no network beyond the single existing
NLP `analyze` call (`TIER-1`, `04`/`06` unchanged in spirit and letter).

**PRD trace.** `docs/AMMENDMENT.md` §A0–§A6 (patch to PRD v4 §3.6, §4, §4.1, §5.8); PRD §3.6
(typo-fixed cloze = `Good` in v1).

**Depends-on.** `00` (`INV-1..3`); `02` (`RAT-1/2/3/5`); `03` (`TIER-5` — the target lane IS the
lemma match); `12` (`DM-2` — the fit-set fields ride the lexical item).

**Out-of-scope.** The offline heal-merge tooling (Deferred, §A3 step 3); free-production rule-layer
bounces (`04`); the judge (`06`).

---

## Build-time content (the fit set is catalog data)

### FIT-1 — Classified `cloze_fit_set` replaces flat synonym lists
**Trace:** AMMENDMENT §A1.2, §A1.3, §A0.
**Requirement:** Every generated lexical item MUST carry `cloze_fit_set`: a list of
`{ lemma, class }` entries enumerating the words that plausibly fill the constrained cloze blank,
each classified against `intended_sense` per the rubric (`FIT-3`). The list MUST contain **exactly
one** entry with `class: "target"`, whose lemma equals the item's lemma; every class MUST be one of
`target` / `same_sense_near_miss` / `different_sense_fit`; entry lemmas MUST be distinct. A flat,
unclassified synonym list MUST NOT be used (it under-covers and conflates the two miss classes —
§A0). `cloze_fit_set` is **catalog content** (PRD §4.1 layer 1) — shared across users, never
per-user data (the `05` memo and multi-tenant boundaries are untouched). Enumeration is
**best-effort, not exhaustive, by design** — completeness is approached asymptotically via the heal
queue (`FIT-10`), and no "list all possible words" target exists.

**Scenario: a built item carries a well-formed fit set**
```
Given a Stage-B generated item for target lemma "owe"
When Stage C validates it
Then cloze_fit_set has exactly one class:"target" entry and its lemma is "owe"
And every entry's class is target, same_sense_near_miss, or different_sense_fit
And entry lemmas are distinct
```

**Scenario: a same-sense entry colliding with an MCQ distractor fails the build**
```
Given an item whose distractors include "lend"
And whose cloze_fit_set lists "lend" as same_sense_near_miss
When Stage C validates it
Then the item fails (the MCQ taught "not this word for this meaning"; a near-miss lane would contradict it)
```

**Notes / edge cases:** a `different_sense_fit` entry MAY coincide with a distractor — "means
something different here" is *consistent* with the MCQ's lesson, unlike the near-miss lane.

### FIT-2 — Constrained cloze: the target is the uniquely natural fill
**Trace:** AMMENDMENT §A1.1 `[DEFAULT]`, §A6.3.
**Requirement:** The cloze sentence MUST be generated under an explicit instruction that the target
is the **uniquely natural fill** (a strong collocational frame), with a self-verification loop: the
generating model attempts its own blank with 10–15 candidates and regenerates the sentence when more
than ~3 non-target words fit naturally. Constraint shrinks the true fit-set *before* enumeration —
the primary defense against the generator-recall gap. Stage C MUST **flag** (not fail) a fit set
whose non-target entry count exceeds the named threshold, as the constraint-pressure signal.

**Scenario: an over-admissive fit set is flagged for review**
```
Given a generated item whose cloze_fit_set carries more non-target entries than the flag threshold
When Stage C validates the batch
Then the item is flagged (committed, routed to _review.json)
And the flag names the fit-set size
```

### FIT-3 — One rubric, single-sourced and versioned
**Trace:** AMMENDMENT §A4 (all), §A4.4 `[DECIDED]`.
**Requirement:** Classification MUST follow the two-gate rubric (proposition test → precision test)
in `docs/CLOZE_FIT_RUBRIC.md`, inlined **verbatim** into the build prompt (and the future heal
prompt — the two MUST NOT drift). Each classification MUST carry a forced one-line justification in
a scratch field that is **discarded** before commit (`why` — stripped at ingest, never persisted).
Boundary rules: a word that fits only ungrammatically or under a different subcategorization frame
MUST NOT enter the fit set at all; genuine uncertainty MUST default to `different_sense_fit`. The
rubric text is versioned (`FIT_RUBRIC_VERSION`); a rubric edit MUST bump the version and invalidate
prior classification (mirrors `MEMO-6`'s `rubric_version` mechanism).

**Scenario: the scratch justification never reaches the catalog**
```
Given a generated batch whose fit-set entries each carry a "why" justification
When ingest commits the batch
Then the committed items' cloze_fit_set entries carry only lemma and class
And no "why" key is persisted
```

### FIT-4 — `bounce_gloss`: the different-sense bounce's meaning cue
**Trace:** AMMENDMENT §A2 (the `{gloss}` in the different-sense copy); user decision 2026-07-14.
**Requirement:** Every generated item MUST carry `bounce_gloss`: a **short paraphrase variant of
`productive_meaning`**, shown only inside the `different_sense_fit` soft-bounce copy ("This word
means {gloss}"). Because it is displayed while the learner must still produce the word, it MUST NOT
contain any token whose lemma equals the target lemma (same leak rule as
`self_reference_prompt`), and it MUST NOT be string-identical to `recognition_meaning` or
`productive_meaning` (a verbatim repeat of the cued gloss would leak that tier's cue). It MUST NOT
be sent to the client before a `different_sense_fit` bounce occurs (ships on the bounce response
only — the `RL-6` reveal pattern).

**Scenario: a leaking bounce_gloss fails the build**
```
Given a generated item for target lemma "owe" whose bounce_gloss contains "owed"
When Stage C validates it
Then the item fails (bounce_gloss leaks a form of the target)
```

### FIT-5 — `fit_set_version` is stamped provenance, not authored content
**Trace:** AMMENDMENT §A1.2 (`fit_set_version`), §A4.4.
**Requirement:** Each item MUST carry `fit_set_version`, stamped by **ingest** (initial value 1) —
never authored by the generating model. It MUST increment on every heal-merge into that item's fit
set and on any rubric change that re-runs classification (`FIT-3`).

**Scenario: ingest stamps the initial version**
```
Given a generated batch that carries no fit_set_version
When ingest commits it
Then every committed item has fit_set_version = 1
```

---

## Runtime — the three-lane deterministic path

### FIT-6 — Lane resolution is a dictionary lookup with fixed precedence
**Trace:** AMMENDMENT §A2 (table), PRD §3.6.
**Requirement:** On cloze submit, the typed word is lemmatized via the existing NLP analyze call and
graded by **lookup against `cloze_fit_set`** — zero LLM, zero additional network. Lanes MUST be
resolved in this precedence order:

| Typed lemma is… | Lane | Rating |
| --- | --- | --- |
| `target` | pass | `Good` |
| `same_sense_near_miss` | soft bounce (precision copy) | **no rating** (`FIT-7`) |
| `different_sense_fit` | soft bounce (different-meaning copy + `bounce_gloss`) | **no rating** (`FIT-7`) |
| Damerau–Levenshtein ≤ `CLOZE_TYPO_MAX_DISTANCE` of target | typo-fix path | `Good` (`FIT-9`) |
| none of the above | wrong path (existing miss flow) | `Again` |

Fit-set membership beats typo distance (a fit-set word one edit from the target is still its own
word — e.g. *own* for *owe*).

**Scenario: a same-sense near-miss soft-bounces**
```
Given a cloze card for "owe" whose fit set lists pay as same_sense_near_miss
When the learner types "paid"
Then the response lemmatizes to "pay" and resolves to the same_sense_near_miss lane
And a soft bounce is surfaced (no reveal of the target)
And no judge/LLM call is made
```

**Scenario: a different-sense fit soft-bounces with the gloss**
```
Given a cloze card for "owe" whose fit set lists lend as different_sense_fit
When the learner types "lend"
Then the different-sense soft bounce is surfaced
And it carries the item's bounce_gloss
```

### FIT-7 — Soft bounces produce no rating (a distinct no-rating class, NOT an `INV-2` bounce)
**Trace:** AMMENDMENT §A2.2 `[DECIDED]`.
**Requirement:** Both soft-bounce lanes MUST derive **no rating**, make **no scheduler call**,
persist **no ReviewLog**, and leave the card due — a `different_sense_fit` is not a retrieval
failure of *this card's* form–meaning link (rating it `Again` injects a phantom lapse), and a
`same_sense_near_miss`'s asymmetric cost is stability corruption. **Boundary:** these are **not**
`INV-2` bounces — the input is well-formed, not malformed. They are a distinct "no-rating graded
interaction" class sharing `INV-2`'s *consequence* but not its definition; they MUST NOT be folded
into the rule-layer bounce counter in analytics or into `retryCount` (`RAT-5`).

**Scenario: a soft bounce never touches the scheduler**
```
Given a cloze submission resolving to a soft-bounce lane under the cap
When the soft bounce is handled
Then no rating is derived
And scheduler.next is NOT invoked
And no ReviewLog is persisted
And the card remains due
```

### FIT-8 — Soft-bounce termination: cap, then reveal → `Again`
**Trace:** AMMENDMENT §A2.1 `[DEFAULT]`; `INV-1`.
**Requirement:** Soft bounces MUST cap at `CLOZE_SOFT_BOUNCE_CAP` (=3) per presentation (the `RL-6`
pattern; its own constant). A learner who reaches the target (or a typo of it) within the cap MUST
rate `Good` on that final outcome — one presentation, one rating, taken on the final gradeable
outcome (`INV-1`). When the cap is exhausted (a soft-bounce-lane submission whose accrued bounces
reach the cap), the submission MUST grade the wrong path (`Again`) and the target MUST be revealed.
The presentation owns per-presentation soft-bounce state and passes it in (the use-case stays
stateless, as with `RL-6` `priorBounces`).

**Scenario: converted within the cap rates Good**
```
Given a presentation that has soft-bounced twice
When the learner types the target word
Then the outcome rates Good
And exactly one rating is derived for the presentation
```

**Scenario: cap exhaustion reveals and rates Again**
```
Given a presentation that has soft-bounced twice (one below the cap)
When the learner submits a third fit-set non-target word
Then the outcome rates Again
And the target word is revealed
And the ReviewLog records softBounceCount = 3
```

### FIT-9 — Typo-fix lane (v1-live)
**Trace:** PRD §3.6 ("a typo-fixed cloze = `Good` in v1, flag recorded"); AMMENDMENT §A2 table;
`RAT-3`.
**Requirement:** A typed cloze response that matches no fit-set lane but is within Damerau–Levenshtein
`CLOZE_TYPO_MAX_DISTANCE` (=1) of the target lemma MUST take the typo-fix path: rate `Good` with
`typoFixed: true` recorded on the ReviewLog. (This activates the v1 rule `RAT-3` already states;
the length-scaled distance and the 4-button `Hard` mapping remain Deferred, `02`.)

**Scenario: a one-edit typo rates Good with the flag**
```
Given a cloze card for target lemma "owe"
When the learner types "owwe"
Then the typo-fix lane resolves (DL distance 1)
And the rating is Good
And the ReviewLog records typoFixed = true
```

### FIT-10 — Instrument the soft-bounce signals from day one
**Trace:** AMMENDMENT §A2.3 `[DEFAULT]`; `RAT-5`.
**Requirement:** The final graded outcome's ReviewLog MUST record `softBounceCount` (soft bounces
accrued on this presentation) and `softBounceLanes` (the lane(s) taken, in order) from day one —
same pattern as the scaffolding/typo flags — so the Deferred 4-button mapping can later map "passed
after synonym bounce" → `Hard`. v1 MUST NOT rate on them. An absent signal MUST round-trip as
absent (never a fabricated 0/empty — the `RAT-5` honesty rule); tiers where the lanes cannot occur
(recognition, cued, free) omit both fields.

**Scenario: a converted pass records its bounce history**
```
Given a presentation that soft-bounced once on the same_sense_near_miss lane
When the learner then types the target and the review is graded
Then exactly one ReviewLog is persisted
And it records softBounceCount = 1 and softBounceLanes = [same_sense_near_miss]
And the rating is Good (the history did not alter the v1 rating)
```

---

## Recall gap — heal queue (runtime half)

### FIT-11 — Wrong-path unlisted words are logged to the heal queue, without user identity
**Trace:** AMMENDMENT §A3 `[DECIDED]` (steps 1–2), §A6.1.
**Requirement:** When a typed cloze response is a plausible word (a single alphabetic word token per
the analyzer), not in `cloze_fit_set`, and not a typo of the target (`FIT-9`), the runtime MUST
(a) grade it on the normal wrong path (`Again` — the learner experience is one plain miss; the
first-hit false harshness is the accepted §A6.1 trade-off), and (b) log
`(sense_id, typed_lemma, clozed_sentence)` to the heal queue. The queue MUST record **no user
identity**. Repeat occurrences of the same `(sense_id, typed_lemma)` MUST NOT create duplicate
rows — the row's existence doubles as the "already seen, never re-queue" memory across builds.
The write MUST NOT change the graded outcome.

**Scenario: an unlisted valid word is graded Again and queued once**
```
Given a cloze card for "owe" whose fit set does not list "settle"
When a learner types "settle"
Then the outcome rates Again (normal miss flow)
And one heal-queue row (sense_id, "settle", clozed_sentence) exists
And the row carries no user identifier
When a second learner later types "settle" for the same sense
Then no second row is created
```

**Notes / edge cases:** "is a real English word" is deliberately approximated — garbage that slips
through is discarded at classification time (`FIT-3` gates it), and the dedup bounds the noise.
Live per-miss LLM escalation is rejected `[DECIDED]` (§A3): it would make cloze billable,
network-dependent, and latency-bearing.

---

## Open / to-validate (non-normative)

- `[VALIDATE]` **Fit-set classification accuracy** — hand-label a small gold set of
  (sentence, typed-word) pairs across the three lanes; compare against build-model classifications
  before trusting the lanes (same gold-set pattern as PRD §5.7).
- `[VALIDATE]` **Heal-queue inflow vs. build cadence** (§A3) — if the queue accumulates valid words
  materially faster than builds retire them, that is the data-driven trigger to reconsider live
  escalation. Do not pre-build it.
- `[VALIDATE]` **Constrained-cloze authorability** — confirm the ≤ ~3-fits constraint is satisfiable
  at acceptable regeneration cost across the catalog; loosen the flag threshold before loosening the
  constraint principle (§A6.3: the lever is better collocational framing).

## Deferred (non-normative — [v2] / enable-later)

- **Offline heal merge** (§A3 step 3): the queue-export script, `heal-feed`/`heal-ingest` pipeline
  commands, rubric-driven classification of queued lemmas, fit-set merge + `fit_set_version` bump.
  The runtime write (`FIT-11`) lands in v1 so no signal is lost; the tooling follows once a queue
  exists.
- **"Passed after synonym bounce" → `Hard`** — part of the Deferred 4-button mapping (`02`); the
  signals are instrumented now (`FIT-10`).
- **Live LLM escalation on cloze misses** — rejected for v1 (§A3, §5.8); revisit only on the
  `[VALIDATE]` inflow trigger above.
