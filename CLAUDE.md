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

**What is implemented:** (1) the **build-time content-generation pipeline** (`build/`,
TypeScript/Node), which realizes `docs/BUILD.md`; and (2) the **first runtime slice** (`src/`,
started 2026-06-30) — see `### v4 runtime (src/)` below. **Most of the v4 web/multi-user runtime
specified in `spec/` still does not exist** — no judge client, rule layer, memo, seeding, counter,
Neon/BetterAuth adapters, or UI yet. Do not assume a runtime piece is present; scaffold it only when
asked. *(Note: v4 dropped the earlier single-user Electron shell for a web/multi-tenant backend —
ignore any stale "Electron" framing elsewhere.)*

### Build pipeline commands

TypeScript runs directly via `tsx` (no compile step). The runtime phase added **vitest** (`npm test`)
as the test runner; there is still **no linter** — do not invent one. The build gates are
`npm run typecheck` (covers `build/**` + `src/**`) and `npm test`.

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run stageA      # Stage A: assemble data/ CSVs → build/out/_manifest.json + _quarantine.json
npm run feed        # Stage B: stage the next 25-item batch → build/out/_pending_batch.json
npm run ingest      # Stage B: merge the in-session-generated batch → build/out/batch_NNNN.json
npm run validate    # Stage C: §7.1 auto-asserts over build/out/items.json (or pass a path)
npm run combine     # concat all batch_*.json → build/out/items.json
```

## v4 runtime (`src/`) — STARTED 2026-06-30

The runtime phase has begun. Code lives in `src/` under a **clean/onion architecture** (governed by
`.claude/rules/`, esp. `ARCH-1..4`), built **test-first** against `spec/` IDs with **vitest**
(`06-tdd.md`). Layout: `src/domain/` (pure, imports nothing outward), `src/application/` (use-cases +
`ports/` interfaces), `src/infrastructure/` (adapters). `src/presentation/` does not exist yet.
NodeNext ESM — relative imports carry `.js` extensions; tests are co-located `*.test.ts` (`TDD-4`).

```bash
npm test            # vitest run (the runtime test gate)
npm run test:watch  # vitest watch
```

**Implemented so far — the deterministic cued-production review slice** (committed on branch
`runtime-cued-slice`, not yet merged to `master`). This is the architecture-proving vertical slice;
it needs **no external services** (no DeepSeek/Neon/BetterAuth/network):
- **domain:** `lexicalItem.ts` (DM-2 read-only contract; its `.test.ts` type-asserts conformance to
  `build/types.ts` so producer/consumer drift fails typecheck — DM-12/DM-4), `card.ts`
  (`MasteryState`, `Card`, `FsrsCardState`), `review.ts`, `rating.ts` (RAT-1), `mastery.ts` (SM-4),
  `grading.ts` (TIER-5 **pure** lemma-match over port-supplied forms).
- **application:** ports `catalog`/`cardRepository`/`scheduler`/`lemmatizer`; use-case
  `submitCuedReview.ts` (grade → rate → schedule → promote → persist).
- **infrastructure:** `winkLemmatizer` (en-US, mirrors `stageC` wink setup — DM-9), `tsFsrsScheduler`
  (ts-fsrs; library types confined to the adapter, one boundary cast), `inMemoryCardRepository`
  (Neon deferred), `JsonCatalog` (reads `build/out/items.json`), `composition.ts` (single wiring
  root). A smoke test runs a real `items.json` item through real wink + ts-fsrs.
- **Covers:** INV-1, INV-3, SM-4, SM-6 (deterministic fail reschedules, never demotes), RAT-1, RAT-8.

**Also implemented — the judged free-production slice** (same branch; still **no external services** —
the cloud judge is **faked**, no DeepSeek/network). Mirrors the cued skeleton, proving INV-2:
- **domain:** `constants.ts` (RL named tunables — `DEGENERATE_MIN_CONTENT_TOKENS`,
  `VERBATIM_SIMILARITY_THRESHOLD`, `MAX_RULE_BOUNCE_RETRIES`), `verdict.ts` (JDG-4 contract +
  **pure** `passesGate` = sense AND grammar, JDG-2/5), `ruleLayer.ts` (RL-2/3/4 **pure** checks +
  `NlpToken` data shape; reuses `isLemmaMatch`), `mastery.ts` `demoteOneRung` (SM-6/7, floors at
  Recognized).
- **application:** ports `judge` (`JudgePort`) + `sentenceAnalyzer` (kept separate from `lemmatizer`,
  SOLID-4); use-case `submitFreeProduction.ts` (rule-layer → judge → rate → demote-on-fail → persist;
  returns a `bounce | judged` union). `ReviewTier` widened to `"cued" | "free"`; `ReviewLog.scaffolded`
  instrumented (RAT-5).
- **infrastructure:** `fakeJudge.ts` (records calls; `passingVerdict` helper), `winkLemmatizer` now
  also implements `SentenceAnalyzer.analyze` (wink UPOS + stopword), `tagalogLexicon.ts` (**stub**
  shipped lexicon for RL-4), `composeFreeProduction` in `composition.ts`. A smoke test runs real
  `items.json` + real wink through a gate-pass (one rating) and a word-absent bounce (no rating).
- **Covers:** INV-2 (bounce → no rating/scheduler/log, card stays due), INV-1, RL-1/2/3/4, RL-6,
  JDG-2/5, SM-6/7, RAT-1/4/5. *(38 tests total at time of writing.)*

**Key design conventions established (follow them in later slices):**
- The **Lemmatizer port returns NLP forms; a pure domain rule decides the match** — keep wink out of
  the domain. `isLemmaMatch` now backs both cued grading (TIER-5) and the rule layer's presence
  check (RL-2); the degeneracy check (RL-3) uses a **separate** `SentenceAnalyzer` port (POS tags),
  not bolted onto `Lemmatizer` (SOLID-4). One wink adapter implements both.
- **Scheduling types** (`FsrsCardState`/`FsrsReviewLog`) are declared **structurally in the domain**;
  ts-fsrs's own `Card`/`ReviewLog` are mapped only inside `tsFsrsScheduler`. Don't leak ts-fsrs (or
  any library) into application/domain — put it behind a port (`ARCH-3`).
- Every test names the `spec/` ID it exercises.

**Deferred (do NOT build until pulled into scope — `PRAG-1`):** recognition MCQ + cloze tiers and
their `Seen` spacing / RAT-7 drop-back; verdict memo (`05`, `MEMO-1` is a `MAY`); the **real**
DeepSeek judge (`JDG-10/11`) + edit resolution (`07`) + failure path (`08`); `Productive→Fluent`
promotion (`SM-5`) + counter (`10`); seeding (`09`); end-to-end loop integration (`11`);
maintenance-at-`Fluent` (`JDG-8`); Neon (STACK-3) + BetterAuth (STACK-4) adapters; presentation/UI.
**Natural next slice:** either `SM-5` `Productive→Fluent` promotion (judged-pass count + calendar-day
spacing + stability + unscaffolded) with the counter (`10`), or the **real DeepSeek judge** adapter +
the `08` failure path (swap `FakeJudge` for the HTTPS transport behind the same `JudgePort`).

> **Status caveat:** this slice is on `runtime-cued-slice`. Re-confirm with `git branch`/`git log`
> and re-run `npm test` at session start — do not trust this count if the tree has moved on.

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
