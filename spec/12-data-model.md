# 12 — Runtime Data Model (consumption contract)

**Purpose.** Fix the entities the runtime reads and persists — the lexical item it consumes, the FSRS
card, the review log, mastery state, and memo rows — and the **producer/consumer contract** with the
build-time pipeline.

**Scope.** The **consumption** contract only. The build-time **producer of record** for the lexical
item is `docs/BUILD.md` + `docs/GENERATION_RULES.md`; this file MUST NOT re-spec generation rules. A
producer/consumer mismatch is a testable assertion here.

**PRD trace.** §4.1 (three layers); §4.1/§8 (FSRS persistence); §5.3 (memo rows).

**Depends-on.** `00`; `docs/BUILD.md §4` (item schema, the upstream source of truth for field
semantics); `02` (card/log usage); `05` (memo rows).

**Out-of-scope.** Database/storage technology, schema migrations, build-time generation rules.

---

## Three layers

### DM-1 — Three layers: lexical item, FSRS card, review
**Trace:** PRD §4.1.
**Requirement:** The model MUST distinguish three layers and keep them separate:

| Layer | Scope | Holds |
| --- | --- | --- |
| **Lexical item** | content, shared across the catalog | the teachable unit + everything needed to render each tier |
| **FSRS card** | one per word, **per user** | the scheduling entity (`02`); tiers are *views*, not separate FSRS objects (`SM-2`) |
| **Review** | one graded interaction | one rating (`02`) + instrumented signals (`RAT-5`) |

---

## Lexical item (consumed; produced at build time)

### DM-2 — Lexical item fields the runtime reads
**Trace:** PRD §4.1; `docs/BUILD.md §4`.
**Requirement:** The runtime MUST read the lexical item shape produced by the build pipeline
(`docs/BUILD.md §4`), comprising **carried** fields (facts from the source CSVs) and **generated**
fields. The runtime MUST treat all of these as read-only inputs and MUST NOT regenerate or mutate
them at runtime.

Carried (build-time Stage A): `word`, `lemma`, `part_of_speech`, `sense_id`, `sense_hint`, `cefr`,
`list_rank`, `band`, `source`.
Generated (build-time Stage B): `intended_sense`, `recognition_meaning`, `distractors` (3),
`clozed_sentence`, `productive_meaning`, `model_sentence`, `self_reference_prompt`.
Provenance: `gen_model`, `gen_spec_version`.

**Scenario: the runtime consumes a built item without mutating it**
```
Given a lexical item loaded from the build output (items.json)
When any tier renders from it
Then the item's carried and generated fields are read unchanged
And the runtime does not regenerate or overwrite any field
```

### DM-3 — Field → tier/judge usage mapping
**Trace:** PRD §4, §5.3, §5.4.
**Requirement:** The runtime MUST use the generated fields as follows; tests assert each consumer
reads the right field.

| Field | Consumed by |
| --- | --- |
| `recognition_meaning` + `distractors` | Recognition MCQ (`TIER-2`) |
| `clozed_sentence` | Cloze tier (`TIER-1`) |
| `productive_meaning` | Cued tier (`TIER-3`) |
| `self_reference_prompt` | Free-production prompt (`TIER-6`) |
| `model_sentence` | rule-layer verbatim-copy guard (`RL-3`); revealed at retry cap (`RL-6`); judge in-context anchor (`06`) |
| `intended_sense` | judge sense gate (`06`); memo key `intended_sense_id` (`MEMO-2`) |
| `lemma` | presence/deterministic grading (`RL-2`, `TIER-5`); memo key (`MEMO-2`) |
| `sense_id` | item identity; memo key `intended_sense_id` (`MEMO-2`) |
| `band` / `cefr` / `list_rank` | seeding band + FSRS cold-start (`SEED-5`, `SEED-8`) |

### DM-4 — `model_sentence: null` items are tolerated
**Trace:** `docs/BUILD.md §7.3` (flag-don't-fix), PRD §5.2.
**Requirement:** Some built items carry `model_sentence: null` (the wink en-US normalization gotcha,
e.g. `aesthetic`→`esthetic`). The runtime MUST tolerate a null `model_sentence`: the verbatim-copy
guard (`RL-3`) and the retry-cap reveal (`RL-6`) MUST degrade gracefully (skip the similarity check;
reveal an alternative) rather than crash.

**Scenario: a null model_sentence does not break the rule layer**
```
Given a lexical item with model_sentence = null
When a free production for it reaches the rule layer
Then the verbatim-copy similarity check is skipped (not an error)
And the other checks (presence, degeneracy, language) still run
```

> [FLAG] Producer/consumer coupling to verify at implementation time: `docs/BUILD.md §4` lists
> `recognition_meaning`/`productive_meaning` glosses and `distractors` as same-POS words; the runtime
> consumption above assumes those invariants hold. If the build output schema and this consumption
> contract drift, surface it (do not silently adapt one side).

---

## Per-user persisted entities

### DM-5 — FSRS card persisted per user
**Trace:** PRD §4.1, §8.
**Requirement:** Each FSRS `Card` MUST be persisted per user as a plain object with `Date` fields
(ts-fsrs). One card per word (`SM-2`); created lazily at introduction (`SEED-7`).

### DM-6 — Review log persisted from review #1
**Trace:** PRD §4.1, §8.
**Requirement:** Every FSRS `ReviewLog` MUST be persisted per user from the first review (`RAT-8`) —
the sole input to per-user optimization. Rule-layer bounces MUST NOT write a `ReviewLog` (`INV-2`).

### DM-7 — Mastery state persisted separately from FSRS state
**Trace:** PRD §2, §3; `INV-3`.
**Requirement:** The mastery state (`01`) MUST be persisted per user, **separate** from the FSRS
internal `State`, and MUST NOT be derived from it (`INV-3`). The scaffolding flag and judged-pass
history needed for `SM-5` / `CNT-2` MUST be persisted.

### DM-8 — Memo rows
**Trace:** PRD §5.3.
**Requirement:** Memo rows MUST be persisted per user with the key
(`normalized_sentence + target_lemma + intended_sense_id`), the stored verdict, and
`model_version` + `rubric_version` (`05`). Memo rows MUST NOT be shared across accounts.

### DM-9 — en-US locale
**Trace:** PRD §4.1.
**Requirement:** The runtime NLP layer (lemma/POS, distractor/cloze handling, presence check) MUST be
set to **en-US** so American forms are accepted (consistent with build-time generation and `TIER-5`).

---

## Notes

The build pipeline (already implemented, `build/`) emits `build/out/items.json` (one array of merged
items). The runtime treats that as its read-only catalog. Field **semantics and quality rules** are
owned by `docs/BUILD.md` / `docs/GENERATION_RULES.md`; this file owns only how the runtime **reads**
them.

## Deferred (non-normative — [v2] / enable-later)

- Sense-split granularity beyond one item per `(headword, POS)` (PRD §4.1 `[DEFAULT]`) — split by
  sense only if data shows valid-but-off-sense rejections piling up; a build-time change, surfaced to
  the runtime only as more items.
