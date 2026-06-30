# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Collaboration Style
- Do not make assumptions when tasked of something, unless explicitly stated.
- Ask for clarifications before proceeding with implementation.
- Find flaws in my logic, explain why it is flawed, and recommend the better approach.

## Engineering Rules

These bind all runtime/code work. Read before writing code; cross-referenced by stable ID. Start
with `00-overview.md` (legend + prefix map).

@.claude/rules/00-overview.md
@.claude/rules/01-architecture.md
@.claude/rules/02-solid.md
@.claude/rules/03-composition.md
@.claude/rules/04-component-principles.md
@.claude/rules/05-pragmatism.md
@.claude/rules/06-tdd.md
@.claude/rules/07-stack.md
@.claude/rules/08-comments.md

## Current state

This repo is **spec-first**, practicing a hybrid **spec-driven + test-driven** methodology: specs are
derived from the PRD, then tests are written against the specs, then runtime code. Sources of truth:

- `docs/PRD.md` — the product requirements (Wikain **v4**: multi-user / web / cloud judge / online).
- `spec/` — the **runtime spec tree** decomposed from `docs/PRD.md` (created 2026-06-30). 13 files
  (`00-overview-invariants` … `12-data-model`), 101 normative requirements with stable IDs
  (`INV/SM/RAT/TIER/RL/MEMO/JDG/EDIT/NET/SEED/CNT/LOOP/DM-*`) + Given/When/Then scenarios. **Read
  `spec/00-overview-invariants.md` first** — it holds the conventions, the four invariants
  (`INV-1..4`), the named tunable constants, and the PRD→spec traceability matrix. Each requirement
  cites its PRD `§`; v1 is normative and v2/enable-later sits in non-normative **Deferred** sections;
  any spec/PRD conflict is flagged (`> [FLAG]`), never silently resolved.

**What is implemented:** only the **build-time content-generation pipeline** (`build/`,
TypeScript/Node), which realizes `docs/BUILD.md`. **The v4 web/multi-user runtime specified in
`spec/` does not exist yet** — no runtime code, no FSRS wiring, no judge client, and **no tests yet**
(the next phase is writing the test runner + tests against the `spec/` IDs/scenarios, then
implementation). Do not assume runtime pieces are present; scaffold them only when asked. *(Note: v4
dropped the earlier single-user Electron shell for a web/multi-tenant backend — ignore any stale
"Electron" framing elsewhere.)*

### Build pipeline commands

TypeScript runs directly via `tsx` (no compile step). There is **no test runner or linter yet** — do
not invent one; `npm run typecheck` is the only build gate.

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run stageA      # Stage A: assemble data/ CSVs → build/out/_manifest.json + _quarantine.json
npm run feed        # Stage B: stage the next 25-item batch → build/out/_pending_batch.json
npm run ingest      # Stage B: merge the in-session-generated batch → build/out/batch_NNNN.json
npm run validate    # Stage C: §7.1 auto-asserts over build/out/items.json (or pass a path)
npm run combine     # concat all batch_*.json → build/out/items.json
```

## Build pipeline architecture (`build/`, docs/BUILD.md)

A **three-stage offline batch pipeline** converting the word lists in `data/` (`NAWL_1.2.csv` + the
two `american_oxford_*_by_cefr_level.csv` files) into runtime lexical items. **Read `docs/BUILD.md`
first** — it is the operational spec, and its `§` references are cited inline in the code.

- **Stage A — `build/stageA.ts` (deterministic, no LLM):** parse → normalize POS → split sense
  parentheticals → scope-filter → quarantine → merge/dedup on `(lemma,pos)` → derive band. Emits
  `_manifest.json` (carried fields only) + `_quarantine.json`, then prints a **gate summary for human
  review before any generation.**
- **Stage B — `build/stageB.ts` (`feed`/`ingest` harness):** the deterministic shell around the
  **in-session generator — Claude Code / Opus 4.8 itself, NOT an external API or API key.** `feed`
  selects the next batch; *Claude Code* writes the generated fields; `ingest` merges, validates, and
  checkpoints. Resumable via `build/out/_done.json` (a crashed run never regenerates or duplicates).
- **Stage C — `build/stageC.ts`:** §7.1 auto-asserts using `wink-nlp` (the same en-US NLP the runtime
  grades with). Reused by `ingest` and runnable standalone.

**The one rule that governs all build code (`docs/BUILD.md` §0, §8):** every item has **carried**
fields (facts from the source CSVs — filled once by Stage A) and **generated** fields (produced by
Stage B). **Stage B must never write, overwrite, or infer a carried field** (CEFR, POS, list_rank,
membership). `stageA.ts` stamps a `_carried_hash`; `ingest` rejects any mutation. Mixing the two is
how factual hallucination enters the data.

- **Constants are single-source** in `build/constants.ts` (`BATCH_SIZE`, the explicit POS map, scope
  sets, the 4 kept NAWL function words, provenance stamps) — never re-hardcode a literal elsewhere.
- **Halt, don't guess.** An unknown POS string or invalid CEFR **throws** rather than being silently
  bucketed (`docs/BUILD.md` §3.1 / §2.2 `[VALIDATE]`). `build/out/` is git-ignored generated output.

### Stage B generation loop — ACTIVE WORK (this is the task in progress)

Stage A is done (5,904 in-scope items in `_manifest.json`). The ongoing work is generating the
catalog **25 items at a time** through Stage B. **For current progress, read `build/out/_done.json`**
(its length = items completed) — do not trust any count written here; it goes stale each batch.

**Progress:** build was reset to zero on 2026-06-29 (the prior 325 items / batches `0000`–`0012` were
deleted — the user was dissatisfied with generation quality, distractors especially). **After the reset,
the first 125 items / batches `0000`–`0004` (`abandon` … `afford`) were regenerated on 2026-06-29 and
all pass Stage C clean** (`combine`+`validate`: 125 items, 0 failing, 0 flagged; typecheck green). The
next `feed` serves the manifest from `advocate`'s neighbors onward (`_done.json` length = 125 — always
re-confirm) and the next `ingest` writes `batch_0005.json`. `_review.json` is `[]` (the 3 shared-stem
flags raised during this run — `adapt_verb_01`/new, `adult_adj_01`/fully, `advantage_noun_01`/better→good
— were reworded away in the committed batch files and cleared, not left for human review).

> **One committed null:** `aesthetic_adj_01` (in `batch_0004.json`) has `model_sentence: null` + an
> `_flags` reason — wink normalizes `aesthetic`→`esthetic`, so no sentence with the carried spelling can
> pass the lemma-presence assert (the documented gotcha). Grep `batch_*.json` for `_flags` to find it.

**Generation rules are now doc-driven (2026-06-29):** the hardcoded `FIELD_RULES` array in `stageB.ts`
is **gone**. The single source of truth for every field's content/quality is **`docs/GENERATION_RULES.md`**
(user-authored) — `feed` references it by path in the payload (`rules_doc`) and **hard-fails if it's
empty/missing**. **Read `docs/GENERATION_RULES.md` before generating each batch.** The §-cross-refs in
that doc point at `docs/PRD.md`. The code-enforced Stage C mechanics below still apply on top of it.

**Checkpoint cadence (established):** rely on `ingest`'s built-in Stage C per batch (it already
fails a batch on any hard miss, so per-batch `npm run validate` is redundant). Run **`npm run combine`
then `npm run validate` every 10 batches and once at manifest exhaustion** — `combine` makes the
`items.json` snapshot, standalone `validate` adds the catalog-wide duplicate-`sense_id` assert.

**Division of labor (agreed with the user — keep it):**
- **The user runs `npm run feed`** by default. Do not run `feed` yourself unless asked. *(Exception:
  the user can authorize a hands-off loop where Claude runs `feed` too — this authorization is
  **per-session**; re-confirm before running `feed` autonomously in a new session.)*
- **Claude generates,** writing the generated fields for every item in `build/out/_pending_batch.json`
  to `build/out/_generated_batch.json` (array; each element = `sense_id` + the 7 generated keys +
  optional `_flags`), **then runs `npm run ingest`** to validate + commit.
- **`feed` and `ingest` are a pair.** `feed` is stateless (it just returns `manifest − _done`); only
  `ingest` writes `batch_NNNN.json` and appends to `_done.json`. If `ingest` is skipped, the next
  `feed` re-serves the *same* 25 items and the scratch `_generated_batch.json` is overwritten (work
  lost). After generating, always `ingest` before the next `feed`.
- `_pending_batch.json` reads can be stale in-session — re-Read it after the user says they fed.

**Generate to pass Stage C (`build/stageC.ts`) on the first try — the non-obvious, code-enforced rules** (a `fail` blocks the whole batch; a `flag` still commits):
- **`model_sentence`:** embed the **bare lemma surface form verbatim** somewhere (guarantees the
  wink lemma-presence assert). **No first-person tokens** at all — `I / I'm / im / my / me / myself`.
- **`self_reference_prompt`:** must contain **no token whose wink lemma equals the target lemma**
  (the leak check is exact-lemma, so other word-family members like `action` for `active` are
  technically fine, but avoid them for clean separation). Must **end with `?`** (or start with a
  verb) and be **< 140 chars**.
- **`clozed_sentence`:** exactly one `_`; it must read cleanly when the **bare lemma** is substituted
  (the validator only checks spacing — no double space, no space-before-punctuation — but pick a
  base-form-friendly context, especially for verbs, so it's grammatical too).
- **`distractors`:** exactly 3, all distinct, none equal to the target word (case-insensitive).
- **`recognition_meaning` vs `productive_meaning`:** never identical, and they should **share no
  content-word lemma** (shared stem → a non-fatal *flag*; reword to dodge it for clean batches). In the
  `a*` run this was the *only* recurring near-miss, always a generic word slipping into both glosses —
  watch `new`, `fully`, and **comparatives** (`better`/`stronger` lemmatize to `good`/`strong`). Cheapest
  fix: write the two glosses from disjoint vocab (e.g. recognition "gain/obtain", productive "come to
  own"); distractors that worked were **antonyms + form-confusables** (`adverse`↔`averse`, `add`↔`subtract`).
- **Carried fields:** never emit them in `_generated_batch.json` — `ingest` reloads carried fields
  from the manifest and **rejects stray keys**. Return generated fields only.

**wink en-US normalization gotcha (discovered while generating `a*`):** the `model_sentence`
lemma-presence assert compares wink's `normal`/`lemma` against the **raw carried lemma string**. wink
Americanizes spelling, so a lemma whose carried spelling differs from wink's normalized form can
**never** satisfy the assert — no sentence can pass. Confirmed: `aesthetic`→`esthetic`,
`archaeology`→`archeology` (also expect `-yse`→`-yze`, `-our`, `oe`/`ae` words). When you hit one,
set `model_sentence: null` + a `_flags` reason (spec §7.3 flag-don't-fix) so the batch still commits;
a human Americanizes the lemma or relaxes the validator later. **Proactively pre-check** risky lemmas
in a scratch script (`nlp.readDoc(word).tokens().itemAt(0).out(its.normal)`) before generating.
*Proper nouns are fine* — `April`→`april`, `AIDS`→`aids` match because wink only lowercases them.

**Flag visibility:** `ingest` routes only Stage C `flags` (e.g. shared-stem) to `_review.json`. An
item's own `_flags` (like the normalization nulls above) live **inside the committed `batch_*.json`**,
not `_review.json` — grep the batch files for `_flags` to find them. (The prior flagged items —
`aesthetic_adj_01`, `archaeology_noun_01`, `ash_noun_01` — were cleared by the 2026-06-29 reset;
`_review.json` is now `[]`. The Americanization nulls will recur on the same lemmas when regenerated.)
