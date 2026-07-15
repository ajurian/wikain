# 00 — Overview, Invariants & Spec Conventions

**Purpose.** Define the conventions every spec file in `spec/` follows, the four cross-cutting
consistency invariants (`INV-1..4`) that the rest of the specs cite by ID, the shared glossary, the
named tunable constants, and the bidirectional traceability matrix back to `docs/PRD.md`.

**Scope.** Runtime core loop only (the Wikain v4 PRD). Build-time content generation is **not**
re-spec'd here — it lives in `docs/BUILD.md` + `docs/GENERATION_RULES.md`; `spec/12-data-model.md`
only fixes the consumption contract between them.

**PRD trace.** PRD §0 (invariants), status legend, v4 changelog.

**Depends-on.** Nothing (this is the root). Every other spec depends on this file.

**Out-of-scope.** Web client/backend split, authentication, packaging, deployment, secret
management beyond what the loop requires (PRD §0).

---

## 1. How to read these specs (conventions)

These conventions are normative for the whole `spec/` tree.

### 1.1 Requirement block shape

Every behavioral requirement is written as:

```
### <ID> — <short title>
**Trace:** PRD §x.y[, §a.b …]
**Requirement:** one atomic statement using RFC-2119 keywords.

**Scenario: <name>**
  Given <precondition>
  When <action>
  Then <observable outcome>
  And <further outcome / asserted side-effect>

**Notes / edge cases:** (optional)
```

- **RFC-2119 keywords** carry their standard meaning: **MUST / MUST NOT** = normative and testable;
  **SHOULD / SHOULD NOT** = strong default, deviation must be justified; **MAY** = optional.
- Each `MUST`/`MUST NOT` requirement carries **≥1 Gherkin scenario** so the TDD phase maps a
  scenario to a test ~1:1. Scenarios name concrete states, ratings, and **asserted side-effects**
  (e.g. "no scheduler call", "no LLM call", "card stays due").

### 1.2 Requirement IDs

- Format `<PREFIX>-<n>`, prefix per owning file (table in §4). IDs are **stable and never reused**;
  a superseded requirement is marked `(superseded by <ID>)`, not renumbered or deleted.
- Cross-file references cite the ID (e.g. "enforces `INV-2`", "see `EDIT-5`"), never restate the
  other requirement's body — single source of truth per requirement.

### 1.3 Status carry-over from the PRD

| PRD marker | Becomes in spec |
| --- | --- |
| `[DECIDED]` | normative requirement (MUST/MUST NOT) |
| `[DEFAULT]` (behavioral) | normative requirement; the default is the v1 behavior |
| `[DEFAULT]` (numeric value) | normative **wiring** to a **named tunable constant** (§3) — tests assert the value is configurable and applied, not the literal |
| `[VALIDATE]` | a non-normative **"Open / to-validate"** subsection in the owning file — tracked, **not** asserted by tests |
| `[v2]` / enable-later | a non-normative **"Deferred"** section in the owning file — documented, never tested |

### 1.4 Normative scope = v1

Only **v1 operative behavior is normative.** The v2 4-button rating, the one-tap override / rejudge /
re-rate, length-scaled cloze typo tolerance (the flat DL≤1 → `Good` rule is v1, `FIT-9`), voice/ASR
input, exam-prep mode, and per-word `Seen`-skip efficiency are **Deferred** (non-normative). Deferred
behavior **MUST NOT** appear in a normative scenario.

### 1.5 PRD-conflict rule (SDD discipline)

The PRD remains the upstream source of truth. If decomposition surfaces a contradiction **within**
the PRD, or between a spec and the PRD, the spec records it as a blockquote `> [FLAG]` note and the
author **surfaces it to the user** — it is **never** silently resolved by picking a side. (Same rule
`docs/BUILD.md §0` applies to the build spec.)

---

## 2. Invariants (`INV-*`) — cross-cutting, normative

These four hold across every tier and every spec. Other files enforce them and cite them by ID.

### INV-1 — One presentation = one review = one rating
**Trace:** PRD §0 (I1), §3.3, §6.
**Requirement:** A single card presentation MUST produce **at most one** review and **at most one**
FSRS rating, computed on the final gradeable outcome. No tier MUST have two rating-bearing
evaluators.

**Scenario: a judged free production yields exactly one rating**
```
Given a word presented at the Free-production tier
When the learner submits a sentence that passes the rule layer and is judged
Then exactly one review is recorded
And exactly one FSRS rating is derived for that presentation
And at most one demotion occurs (on a fail)
```

**Notes / edge cases:** Trivially satisfied in v4 because each tier has exactly one evaluator —
deterministic self-grade on recognition/cloze/cued, the cloud judge on free production and
maintenance. A transport-level inference retry (`NET-*`) is **not** a second evaluation.

### INV-2 — Rule-layer bounces are not reviews
**Trace:** PRD §0 (I2), §3.6, §5.2, §7.
**Requirement:** Input rejected by the rule layer (target word absent, degenerate, or Taglish), and
any cloud-call failure (timeout/5xx/429/offline), MUST produce **no rating and no scheduler call**;
the card MUST stay due. Rating these as `Again` is forbidden — it injects phantom lapses and
corrupts FSRS stability.

**Scenario: a word-absent submission does not touch the scheduler**
```
Given a Free-production attempt whose sentence omits the target lemma
When the rule layer bounces it as "target absent"
Then no FSRS rating is derived
And the scheduler (scheduler.next) is NOT invoked
And no ReviewLog is persisted
And the card remains due
```

**Notes / edge cases:** This is called out in the PRD as **the single most important correctness
rule in the integration.** Enforced by `RAT-2`, `RL-*`, `NET-*`, `LOOP-*`.

### INV-3 — Scheduling and mastery are separate signals
**Trace:** PRD §0 (I3), §2, §3.
**Requirement:** The FSRS scheduling state (when shown again) and the mastery state (which tier /
badge) MUST be stored separately and MUST NOT be derived from one another. They interact **only**
through demotion (`SM-*`).

**Scenario: an FSRS State is never read as a mastery state**
```
Given a word whose FSRS internal State is "Review"
When the system selects the card tier to present
Then the tier is chosen from the mastery state (Seen/Recognized/Productive/Fluent)
And the FSRS State is NOT used to choose the tier
```

### INV-4 — Only free *judged* productions count toward the counter and `Fluent`
**Trace:** PRD §0 (I4), §3.2, §9.
**Requirement:** Recognition, cloze, and cued passes MUST NOT count toward the "words you can now
use" counter (`CNT-*`) or toward `Productive→Fluent` promotion (`SM-*`). Only free productions that
pass the cloud judge count.

**Scenario: a cued pass does not advance the Fluent count**
```
Given a word at Productive with 0 qualifying judged productions
When the learner passes a cued-production card
Then the word's Fluent-progress count remains 0
And the "words you can now use" counter does not include the word on this basis
```

---

## 3. Named tunable constants

PRD `[DEFAULT]` numeric values are wired through named constants so tests assert configurability and
application, not magic literals. Each is **owned** by one spec; this table is the index.

| Constant | Default | Owner | PRD trace |
| --- | --- | --- | --- |
| `FLUENT_JUDGED_PASSES` (N) | 3 | `SM` | §3.2 |
| `FLUENT_MIN_STABILITY_DAYS` | ~21 | `SM` | §3.2 |
| `SEEN_CLOZE_DROPBACK_CAP` | 1 | `RAT` | §3.6 |
| `MAX_RULE_BOUNCE_RETRIES` | 3 | `RL` | §5.2 |
| `DEGENERATE_MIN_CONTENT_TOKENS` | 4 | `RL` | §5.2 |
| `VERBATIM_SIMILARITY_THRESHOLD` | 0.90 | `RL` | §5.2 |
| `RECOGNITION_MCQ_OPTIONS` | 4 | `TIER` | §4 |
| `COUNTER_MIN_SPACED_PASSES` | 2 | `CNT` | §9 |
| `COUNTER_R_FLOOR` | 0.70 | `CNT` | §9 |
| `REQUEST_RETENTION` | 0.90 | `SEED` | §8 |
| `PER_USER_OPT_REVIEW_THRESHOLD` | ~1000 | `SEED` | §8 |
| `NEW_PER_DAY` | ~5 | `SEED` | §8 |
| `NEW_FRACTION_UNDER_BACKLOG` | 0.30 | `SEED` | §8 |
| `FIRST_SESSION_SEED_WORDS` | ~2 | `SEED` | §8 |
| `DAILY_GOAL_DEFAULT` | 5 | `CNT` | §9 |
| `CLOUD_RETRY_COUNT` | 1 | `NET` | §7 |
| `CLOZE_SOFT_BOUNCE_CAP` | 3 | `FIT` | AMMENDMENT §A2.1 |
| `CLOZE_TYPO_MAX_DISTANCE` | 1 | `FIT` | §3.6, AMMENDMENT §A2 |

> All values are tunable from review data (PRD §11 "sign-offs"). None is load-bearing enough to
> agonize over pre-build; the spec fixes the **wiring**, not the number.

---

## 4. File / prefix index

| File | Prefix | Owns |
| --- | --- | --- |
| `00-overview-invariants.md` | `INV` | invariants, conventions, constants, traceability |
| `01-state-machine.md` | `SM` | mastery ladder, promotion/demotion, scaffolding, track model |
| `02-fsrs-rating.md` | `RAT` | rating derivation, scheduling/mastery separation, log persistence |
| `03-card-tiers.md` | `TIER` | the 5 tiers, deterministic grading, self-reference + fallback |
| `04-rule-layer.md` | `RL` | presence / degenerate / Taglish pre-screen, retry termination |
| `05-verdict-memo.md` | `MEMO` | per-user memo key, normalization, version invalidation |
| `06-cloud-judge.md` | `JDG` | judge axes, gate = sense AND grammar, lenient bias, JSON contract, config |
| `07-edit-resolution.md` | `EDIT` | find/replace span resolution, inline render contract |
| `08-failure-path.md` | `NET` | online-only, "checking…", cloud failure handling, key server-side |
| `09-seeding-placement.md` | `SEED` | first-win seeding, placement mechanisms, pacing, cold-start |
| `10-counter-goal.md` | `CNT` | counter, retrievability gate, daily goal |
| `11-end-to-end-loop.md` | `LOOP` | the §10 one-pass orchestration |
| `12-data-model.md` | `DM` | lexical item / FSRS card / review entities (bridges BUILD.md) |
| `13-cloze-fit-set.md` | `FIT` | classified cloze fit-set, three-lane grading, soft bounces, typo lane, heal queue |

---

## 5. Glossary

- **Mastery state** — `New` / `Seen` / `Recognized` / `Productive` / `Fluent` (PRD §3.1). Owned by
  the state machine; tied to production success; can regress.
- **FSRS `State`** — ts-fsrs' internal scheduling phase (`New`/`Learning`/`Review`/`Relearning`).
  **Distinct** from the mastery state (`INV-3`); both have a notion of "new" — never derive one from
  the other.
- **Tier** — a *view* of one FSRS card (recognition / cloze / cued / free production / spaced
  maintenance), selected by the mastery state. Not a separate FSRS object.
- **Gate** — a hard pass/fail check. Free production has two gates (sense, grammar); both must pass.
- **Bounce** — a rule-layer rejection of malformed input. **Not** a review (`INV-2`).
- **Scaffolded** — a production attempt made with a hint / sentence starter (PRD §3.4). Flag gates
  the mastery ladder, not the rating.
- **Judged production** — a free production that reached and passed the cloud judge. Only these count
  toward the counter and `Fluent` (`INV-4`).
- **Carried vs generated fields** — carried = facts from the source CSVs (filled by build-time Stage
  A); generated = produced by build-time Stage B. Runtime consumes both (`DM-*`); see `docs/BUILD.md`.

---

## 6. Traceability matrix (PRD § → owning spec)

Every PRD section maps to ≥1 spec file. Reverse map (requirement → PRD §) lives in each requirement's
`**Trace:**` line. No PRD row may be empty (coverage audit, `spec` verification).

| PRD § | Topic | Owning spec(s) |
| --- | --- | --- |
| §0 | Scope, invariants I1–I4 | `00` (`INV-1..4`) |
| v4 changelog | platform pivot, removed/kept mechanisms | `00`, `06`, `08`, `05` |
| §1 | product frame, modalities (written-first; voice deferred) | `03` (Deferred: voice) |
| §2 | two signals (scheduling vs mastery) | `01`, `02` (`INV-3`) |
| §3.1 | states + card tier per state | `01` |
| §3.2 | promotion triggers | `01` |
| §3.3 | demotion triggers; no recovery in v1 | `01` |
| §3.4 | scaffolding | `01` |
| §3.5 | single-track model | `01` |
| §3.6 | deriving the FSRS rating; cloze drop-back | `02` (`INV-1`, `INV-2`) |
| §4 | card tiers, MCQ meaning→word, self-reference + fallback | `03` |
| §4.1 | word list → cards; three layers; FSRS wiring; en-US | `12`, `02` |
| §5.1 | judge trigger condition | `04`, `06` |
| §5.2 | rule layer (presence/degenerate/Taglish); retry termination | `04` |
| §5.3 | verdict memo | `05` |
| §5.4 | cloud judge axes; maintenance latency | `06` |
| §5.5 | governing principle; promotion gate; no override/rejudge | `06` |
| §5.6 | structured output + precise-replacement edit contract | `07` |
| §5.7 | judge configuration; gold set; drift | `06` |
| §5.8 | not used | `06` (notes) |
| §6 | when the model runs / does not run; maintenance every rep | `04`, `06`, `11` |
| §7 | online inference, "checking…", failure path, key handling | `08` |
| §8 | first-session seeding, placement, pacing, FSRS defaults | `09` |
| §9 | gamification: counter, retrievability gate, daily goal, inline feedback | `10`, `07` |
| §10 | end-to-end loop (one pass) | `11` |
| §11 | consolidated decisions (P1–P11, items 1–14) | distributed; index here |
| Risks v4 | false-rejection unrecoverable; drift feed; network dep; cost/abuse | `01`, `06`, `08`; backend out-of-scope |
| AMMENDMENT §A0–A6 | typed-cloze fit-set & soft bounce (patch to §3.6/§4/§4.1/§5.8; decision item 15) | `13` (`FIT-1..11`); `02`, `03`, `12` cross-refs |

> §11 decision tables are not a separate spec; each decision is realized as a requirement in its
> owning file and cited above. The "Risks introduced by v4" items 1–3 are encoded as normative
> requirements (`SM`, `06`, `08`); risk 4 (operator cost / abuse) is **backend**, explicitly
> out-of-scope for this flow per PRD §0/§7 — recorded here so it is not forgotten.

---

## 7. Deferred (non-normative — [v2] / enable-later)

Indexed here; detailed in each owning file's Deferred section.

- **4-button FSRS rating** (`Again`/`Hard`/`Good`/`Easy`) — `02`. v1 is binary.
- **One-tap override / "count this as correct" / rejudge / re-rate** — `01`, `06`. Removed in v1;
  the recommended zero-cost no-model-call mitigation for the unrecoverable-false-rejection risk is
  recorded but **not** built.
- **Length-scaled cloze typo tolerance + `Hard` mapping** (DL ≤1 for ≤6 chars, ≤2 longer → `Hard`) —
  `02`. The flat DL≤1 → `Good` rule is **v1** since the AMMENDMENT (`FIT-9`).
- **Offline heal merge + live cloze LLM escalation** — `13`.
- **Voice / ASR second input method**; pronunciation scoring — `03`. Gated on PH-accent WER.
- **Exam-prep mode / register-gating** — `06`. v1 is single clean-English mode.
- **High-proficiency `Seen`-skip efficiency** — `09`.
- **Collocation-production tier** — `03`. v1 keeps collocation advisory in the judge + enrichment.
