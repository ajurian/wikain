# Wikain PRD Amendment — Typed-Cloze Fit-Set & Soft Bounce (patch to v4)

> **Status legend** (inherited from PRD v4): `[DECIDED]` = confirmed. `[DEFAULT]` = recommended
> starting value; ship, instrument, tune. `[VALIDATE]` = confirm against real data or an external
> check.
>
> **Scope.** This amendment adds graded handling of non-target-but-valid words on the **typed
> cloze** tier. It patches §4.1 (build-time content), §3.6 (rating derivation), §4 (card tiers),
> §5.8 (Not used), and "Items still pointing outward." All PRD invariants (I1–I4) are preserved;
> cloze remains deterministic at runtime (no LLM, no network — §4/§6 unchanged in spirit and
> letter).

---

## A0. Problem statement

The current cloze grades binary: exact target lemma = pass, anything else = wrong. Two failure
modes follow:

1. **Valid-synonym false harshness.** A learner who types a word in the same meaning
   neighborhood as the target (e.g. *pay* for *owe*) is graded identically to garbage input.
2. **Fits-but-different-sense conflation risk.** Some sentences admit words that fill the blank
   grammatically but express a *different* meaning or inverted roles (e.g. *lend* for *owe* in
   "He ___ his brother fifty dollars"). Treating these as near-misses would teach a false
   equivalence (owe ≈ lend) — the precise form–meaning confusion the app exists to correct
   (§1, Tagalog-L1 precision errors). Treating them as garbage is needlessly harsh.

A flat `near_miss_synonyms` list is rejected as the fix: it under-covers (generator recall gap)
and conflates the two miss classes (observed in generated content: *refund*/*remit* listed as
near-misses of *owe* — money-frame co-occurrence mistaken for sense match).

**Rejected approaches (recorded in §A6 / §5.8):** live cross-encoder / reranker comparison
(context dilution: the two sentences differ by one token, so shared context swamps the signal;
sense-blindness: a generic similarity score cannot see `intended_sense`; converse/antonym
acceptance risk), live embeddings on cloze, and "fits the context → accept."

---

## A1. Patch to §4.1 — build-time constrained cloze + classified fit-set

The batch content-generation step (strong offline model; cost and latency immaterial) changes in
two ways per lexical item.

### A1.1 Constrain the cloze sentence `[DEFAULT]`

- Generate the cloze with an explicit instruction that the **target must be the uniquely natural
  fill** — force a strong collocational frame (e.g. "I **still** ___ my brother fifty dollars
  **from last week**" — "still owe … from" is strongly collocated; "still lend … from" is broken).
- **Self-verification loop:** the model attempts to fill its own blank with 10–15 candidate
  words. If more than **~3 non-target words** fit naturally `[DEFAULT]`, regenerate the sentence.
- Rationale: constraint shrinks the true fit-set *before* enumeration, so enumeration only has to
  be good over a bounded set, not over English. This is the primary defense against the
  generator-recall gap.

### A1.2 Replace `near_miss_synonyms` with a classified `cloze_fit_set` `[DECIDED]`

The model **enumerates** every word that plausibly fills the constrained blank, then
**classifies** each against `intended_sense` (rubric: §A4):

```jsonc
{
  "sense_id": "owe_verb_01",
  "intended_sense": "To be indebted to someone for a sum of money or a favor; ...",
  "clozed_sentence": "I still _ my brother fifty dollars from last week.",
  "cloze_fit_set": [
    { "lemma": "owe",   "class": "target" },
    { "lemma": "pay",   "class": "same_sense_near_miss" },
    { "lemma": "repay", "class": "same_sense_near_miss" },
    { "lemma": "lend",  "class": "different_sense_fit" },
    { "lemma": "give",  "class": "different_sense_fit" }
  ],
  "fit_set_version": 1
  // ...rest of the lexical item unchanged (distractors, prompts, model sentence, etc.)
}
```

- Classification requires a **forced one-line justification per word** in a scratch field that is
  discarded after generation. The justification requirement is what prevents frame-co-occurrence
  words (*refund*, *remit*) from being misfiled as sense matches — the model cannot justify
  "same participant roles" for *refund*/*owe*.
- `fit_set_version` increments on every heal-merge (§A3) or rubric change (§A4.4).
- **Enumeration is best-effort, not exhaustive, by design.** Completeness is *not* assumed; it is
  achieved asymptotically through the heal queue (§A3). No prompt engineering target of "list all
  possible words" exists — that target is unsatisfiable and is explicitly not a correctness
  requirement of this design.

### A1.3 Storage layer

`cloze_fit_set` and all healed additions are **catalog content** (§4.1 layer 1, the lexical
item) — shared across users, same object class as distractors and cloze sentences. They are
**not** per-user data; the §5.3 per-user verdict memo and the deleted cross-user cache are
untouched. Multi-tenant line (v4 changelog) intact.

---

## A2. Patch to §3.6 / §4 — three-lane deterministic runtime path

On cloze submit, wink-nlp lemmatizes the typed word; grading is a **dictionary lookup** against
`cloze_fit_set`. Zero LLM, zero network; cloze stays deterministic (§4 table and §6 "does NOT
run" list unchanged).

| Typed lemma is… | Response surface | Rating |
| --- | --- | --- |
| `target` | pass | `Good` |
| `same_sense_near_miss` | **soft bounce** — "Close — I'm after a more precise word for this exact meaning: o___" | **no rating** (§A2.2) |
| `different_sense_fit` | **soft bounce, distinct copy** — "That's a real sentence — but *{word}* means something different here. This word means {gloss}: o___" | **no rating** (§A2.2) |
| Damerau–Levenshtein ≤ 1 of target (existing typo rule) | typo-fix path | `Good` (per §3.6 v1 rule) |
| none of the above | wrong path (reveal per existing flow) | `Again` |

### A2.1 Bounce termination `[DEFAULT]`

Soft bounces cap at the existing `MAX_RULE_BOUNCE_RETRIES = 3` (§5.2 pattern), then **reveal**.
- Converted within the cap (learner reaches the target) → final outcome rates `Good` — consistent
  with I1: one presentation, one rating, taken on the **final gradeable outcome**.
- Cap exhausted → reveal → `Again`.

### A2.2 Rating rule `[DECIDED]`

**Both soft-bounce lanes produce no rating in themselves.** Rationale:

- A `different_sense_fit` is **not** a retrieval failure of *this card's* form–meaning link — the
  learner retrieved a different concept. Rating it `Again` injects a phantom lapse for a word the
  learner may know perfectly well (the corruption class I2 exists to prevent, here sourced from
  grading semantics rather than malformed input).
- A `same_sense_near_miss` is arguably a form-retrieval failure, but cloze ratings are already
  low-value short-history signal (§3.6), the asymmetric cost is stability corruption from phantom
  lapses, and the bounce cap prevents retry-gaming.
- **Boundary note vs I2:** these are *not* I2 bounces (the input is well-formed, not malformed);
  they are a distinct "no-rating graded interaction" class. They share I2's *consequence* (no
  rating, no scheduler call, card stays in-presentation) but not its definition. Do not fold them
  into the I2 bounce counter in analytics.

### A2.3 Instrumentation `[DEFAULT]`

Record `soft_bounce_count` and the bounce lane(s) taken on the review log from day one (same
pattern as the scaffolding / typo-fix flags, §3.4/§3.6), so the `[v2 / enable-later]` 4-button
mapping can later map "passed after synonym bounce" → `Hard` if data supports it. No live
behavior change in v1.

---

## A3. Recall gap — offline self-heal queue `[DECIDED]`

When a typed lemma is (a) a real English word, (b) not in `cloze_fit_set`, and (c) not a typo of
the target:

1. **Now:** grade on the **wrong path** (normal miss flow; `Again` per §A2 table). The learner
   experience for an unlisted-but-valid word is one plain miss.
2. **Log** `(sense_id, typed_lemma, clozed_sentence)` to a **heal queue**. The queue records no
   user identity — lemma + item only (multi-tenant preserved).
3. **Next batch build:** classify every queued lemma via the §A4 rubric, merge results into
   `cloze_fit_set`, bump `fit_set_version`. The gap is closed permanently, fleet-wide.

**Why offline, not live-escalate `[DECIDED]`:** a live per-miss LLM call would make cloze
billable, network-dependent, and latency-bearing — breaking the §4/§6 property that only free
production touches the judge. Accepted cost: the *first* learner to hit a given gap eats one
false harsh grade until the next build; every subsequent learner gets the correct lane.

`[VALIDATE]` **Revisit trigger:** if the heal queue accumulates valid words materially faster
than the build cadence retires them (instrument queue inflow vs. merge rate), that is the
data-driven trigger to reconsider live escalation. Do not pre-build it.

---

## A4. Classification rubric (shared by build enumeration and heal classification)

The criterion is **not** "is it a synonym" (dictionary relation; ignores the sentence) and
**not** "does it fit the blank" (both miss classes fit by construction). It is a **two-gate check
of the typed word *in this sentence* against `intended_sense`**:

### A4.1 Gate 1 — proposition test

Substitute the word into the sentence. Does the resulting sentence assert (approximately) the
**same state of affairs** — same participant roles, same direction of the relation, same truth
conditions — as the sentence with the target?

- *repay* in "I still ___ my brother fifty dollars" → same debtor/creditor roles → **passes**.
- *lend* → roles inverted (speaker becomes creditor) → **fails** → `different_sense_fit`.
- Gate 1 is what catches **converses and antonym-like fits** (the owe/lend case), which a
  "similar meaning?" question misses because converses *feel* related.

### A4.2 Gate 2 — precision test (Gate-1 passers only)

Is the typed word merely a hypernym / looser / register-shifted expression of the same
proposition? If same proposition but less precise → `same_sense_near_miss`.

- *pay* for *owe*: same situation, loses the "state of indebtedness" component → near-miss.

### A4.3 Operational prompt form

> "A learner wrote sentence S with word W instead of target T (intended sense: D).
> (a) Does S-with-W describe the same situation, with the same roles for the same participants,
> as S-with-T? If no → `different_sense_fit`.
> (b) If yes: would a teacher say 'correct idea, but the precise word is T'? If yes →
> `same_sense_near_miss`.
> Justify in one line." *(Justification field is discarded after generation — §A1.2.)*

### A4.4 Boundary rules `[DECIDED]`

- A word that fits only **ungrammatically** or under a **different subcategorization frame**
  (e.g. requires "___ **to** his brother") is **not in the fit-set at all** → wrong path, no
  bucket.
- **Uncertainty default:** when genuinely uncertain between buckets, classify as
  `different_sense_fit`. Its learner-facing copy ("means something different — try the word for
  {gloss}") is the safer message; the asymmetric harm is telling a learner two non-equivalent
  words are close.
- **Rubric versioning:** the rubric text is identical, verbatim, in the build prompt and the heal
  prompt. Version it alongside `fit_set_version`; a rubric edit invalidates and re-runs
  classification (same mechanism as `rubric_version` in §5.3).

---

## A5. Patches to consolidated-decisions tables

Append to **Pedagogy & loop**:

| # | Item | Resolution | Status |
| --- | --- | --- | --- |
| 15 | Cloze fit-set (§A1–A4) | Constrained cloze (≤ ~3 non-target fits, regenerate otherwise); classified `cloze_fit_set` replaces flat `near_miss_synonyms`; three-lane runtime (target / same-sense near-miss / different-sense fit); soft bounces = no rating, cap 3 then reveal; offline heal queue closes recall gaps at next build; two-gate rubric (proposition → precision), uncertainty defaults to `different_sense_fit`. | `[DECIDED]` (structure) + `[DEFAULT]` (numeric values) |

Append to **Items still pointing outward**:

- `[VALIDATE]` **Fit-set classification accuracy** — hand-label a small gold set of
  (sentence, typed-word) pairs across the three lanes; compare against build-model
  classifications before trusting the lanes (same gold-set pattern as §5.7).
- `[VALIDATE]` **Heal-queue inflow vs. build cadence** (§A3) — the live-escalation revisit
  trigger.
- `[VALIDATE]` **Constrained-cloze authorability** — confirm the ≤ ~3-fits constraint is
  satisfiable at acceptable regeneration cost across the catalog; loosen the threshold before
  loosening the constraint principle.

Append to **§5.8 Not used**:

- **Cross-encoder / reranker synonym validation on cloze** (context dilution + sense-blindness +
  converse acceptance; §A0).
- **Live LLM escalation on cloze misses** (breaks the deterministic-cloze property; offline heal
  chosen instead — §A3).
- **Flat synonym lists** (recall under-coverage + near-miss/different-sense conflation — §A0).

---

## A6. Risks and accepted trade-offs (read before sign-off)

1. **First-hit false harshness (accepted).** The first learner fleet-wide to type a given
   unlisted valid word gets the plain wrong path for that one presentation, until the next build
   merges the heal queue. Bounded to once per gap per fleet; the alternative (live escalation)
   was rejected for cost/latency/determinism reasons and remains available behind the §A3
   `[VALIDATE]` trigger.
2. **Build-model classification error.** A misclassified fit-set entry mis-lanes learners
   deterministically and repeatedly until corrected. Mitigations: forced justifications (§A1.2),
   uncertainty-defaults-to-`different_sense_fit` (§A4.4), and the gold-set check (§A5). A
   catalog-content fix is a data edit + `fit_set_version` bump, not a code change.
3. **Constraint pressure on sentence authenticity.** Forcing "uniquely natural fit" cloze
   sentences trades some naturalness for discriminative power. Monitor whether constrained
   sentences read as stilted; the lever is better collocational framing, not loosening the
   fit-count threshold first.
4. **No-rating lanes reduce cloze signal further.** Cloze ratings were already low-value (§3.6);
   this amendment removes rating events from two more interaction types. Accepted because
   scheduling becomes meaningful at the free-production tier (§3.6) and phantom-lapse avoidance
   dominates; `soft_bounce_count` instrumentation (§A2.3) preserves the signal for the v2
   4-button mapping.