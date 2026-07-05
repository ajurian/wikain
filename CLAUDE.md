# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

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
TypeScript/Node), which realizes `docs/BUILD.md`; and (2) the **v4 runtime** (`src/`, started
2026-06-30) — see `### v4 runtime (src/)` below — now spanning the whole review loop, first-session
seeding, the real DeepSeek judge, the usable-words counter, edit resolution, the verdict memo, a
Drizzle/Neon persistence adapter, **real BetterAuth email+password auth with per-user settings**, and a
fully **wired, guarded** TanStack Start UI (every surface — `/`, `/review`, `/words`, `/onboarding`,
`/settings`, `/signin`, `/signup` — runs on real use-cases behind a real session). The app is now
**multi-tenant and secrets-required**: it fails fast on boot without `DATABASE_URL`, `DEEPSEEK_API_KEY`,
and `BETTER_AUTH_SECRET` — there are **no in-memory adapters or offline fallbacks** anywhere (tests run
against embedded pglite). **A few spec pieces remain deferred** — LexTALE (SEED-4), per-user FSRS
optimization (SEED-8), and the counter's yesterday-delta (needs a persisted daily snapshot). Do not
assume a runtime piece is present; scaffold it only when asked.
*(Note: v4 dropped the earlier single-user Electron shell for a web/multi-tenant backend — ignore any
stale "Electron" framing elsewhere.)*

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

Code lives in `src/` under a **clean/onion architecture** (`.claude/rules/`, esp. `ARCH-1..4`), built
**test-first** against `spec/` IDs with **vitest** (`06-tdd.md`). Layout: `src/domain/` (pure),
`src/application/` (use-cases + `ports/`), `src/infrastructure/` (adapters), `src/presentation/`
(TanStack Start app — own `tsconfig`, `npm run typecheck:web`, excluded from the NodeNext backend
gate). NodeNext ESM — relative imports carry `.js`; tests co-located `*.test.ts` (`TDD-4`). Backend
slices 1–11 are on **`master`**; every UI slice — 12 (design), 13–20 (backend wiring) — lands on
**`design/brand-ui-system`** and descendant wiring branches (re-confirm with `git log`).

**Persistence & secrets (since slice 20):** there is **one Drizzle-only persistence path** — no
in-memory adapters, no offline/URL-gated/key-gated fallbacks. The app **requires** `DATABASE_URL`,
`DEEPSEEK_API_KEY`, and `BETTER_AUTH_SECRET`; the presentation composition root throws at load if any is
missing (fail fast). Tests run against embedded **pglite** (`makePgliteDb()`); `FakeJudge` is the one
test-only double (the judge is a paid external service). Run `npm run db:migrate` once against Neon
before boot.

```bash
npm test               # vitest run (runtime test gate; pglite-backed, capped forks — see vite.config.ts)
npm run test:watch     # vitest watch
npm run typecheck      # NodeNext backend gate (build/** + src/** minus presentation)
npm run typecheck:web  # presentation tsconfig
npm run dev            # the TanStack Start app (needs the 3 env vars)
npm run db:migrate     # apply drizzle/ migrations to Neon (once, before the DATABASE_URL path)
```

**Implemented slices** (1–20; each byte-preserves earlier use-cases unless noted). Terse — read the
code + `spec/` IDs for detail:

1. **Cued-production review** — grade→rate→schedule→promote→persist (`submitCuedReview`); wink
   lemmatizer + ts-fsrs behind ports. INV-1/3, SM-4/6, RAT-1/8, TIER-5.
2. **Judged free-production** — rule-layer→judge→rate→demote-on-fail; `bounce|judged`
   (`submitFreeProduction`). INV-2, RL-1/2/3/4/6, JDG-2/5, SM-6/7.
3. **End-to-end loop** — `runReviewPass` routes by mastery (`selectTier`). LOOP-1..5, SM-1.
4. **Fluent promotion + counter** — distinct-day judged-pass ledger; live-retrievability gate at read
   (`readUsableCounter`). SM-5, CNT-2/3/4/6, INV-4.
5. **Real DeepSeek judge** — HTTPS adapter behind `JudgePort`; `unavailable` arm (transport failure ≠
   bounce). NET-3/4/5/6/7, JDG-6/10/11.
6. **Pure edit-resolution** — `resolveEdits` → inline | fallback. EDIT-2..6.
7. **First persistence** — Drizzle adapter behind `CardRepository` (pglite + Neon, one shared contract
   test). DM-5/6/7, SM-2.
8. **`Seen` on-ramp** — recognition + cloze tiers via a shared `submitDeterministicReview` core;
   `nextSeenTier` routing. TIER-1/2/5, SM-3, RAT-7.
9. **First-session seeding** — pacing→select→cold-start→entry-state (`seedIntroductions`). The three
   SEED-2/3 placement mechanisms stay structurally separate. SEED-1/2/3/5/6/7/8/9, SM-11.
10. **Session queue** — `orderSessionQueue` (due filter + even intro interleave); `startSession`.
    LOOP-1 step 1, SEED-6.
11. **React deterministic review** — the TanStack Start app; `resolveReviewTier` is the single source so
    shown-tier == graded-tier. render TIER-1/2/5, LOOP-1.
12. **Brand + design system** — full mock-driven UI (warm editorial; Fraunces/Inter; honest counter, no
    streaks). Two skills (`.claude/skills/brand/`, `.../design-system/`). *(Was mock-only; slices 13–20
    wired it.)*
13. **Wire `/review`** — real server functions drive the whole loop incl. the judged flow;
    `checkFreeProductionRuleLayer` extracted; `ruleCheckFn` instant bounce (NET-2); `presentReviewOutcome`
    DTO. LOOP-1..5, EDIT-7, NET-2/3/5, INV-2.
14. **Wire DB + counter** — `/` usable-words counter on the real store. CNT-2/3/4/6, STACK-3.
15. **Wire dashboard read-models** — `readDashboardSummary` (SM-1 ladder + due/new + today's judged
    uses). SM-1, CNT-8, SEED-6.
16. **Wire `/words`** — `readWordsList`/`readWordDetail` + `deriveMasteryHistory` (replayed from logs;
    sentence text dropped for v1). CNT-1/2/3, SM-3..7.
17. **Wire `/onboarding`** — `frontierBandForCoarseLevel` + `judgeFirstProduction` (the SEED-1
    judge-DON'T-persist first win). SEED-1/2/5/6.
18. **Verdict memo** — a per-user cache that skips a billable re-judge on an identical resubmission;
    invisible (no gate-outcome change). `verdictMemo` + `verdict_memos` table. MEMO-1..6, DM-8.
19. **Placement-marks store** — the onboarding TuneStep persists per-word known flags → flagged words
    lazily card at `Recognized`. `placement_marks` table. SEED-2/3/7, SM-11.
20. **BetterAuth + single Drizzle path** (this slice, `wire/betterauth-identity`). Real email+password
    auth (STACK-4) + full route guards + per-user settings, AND the collapse to **one Drizzle-only
    persistence path** (no in-memory adapters, no fallbacks). domain: `settings.ts`
    (`UserSettings`/`DEFAULT_USER_SETTINGS`), `DAILY_GOAL_MIN/MAX`. application (TDD): `ports/settings.ts`
    (`SettingsStore`), `readSettings`/`updateSettings` (goal clamp [1,20]); `readDashboardSummary` now
    reads the goal from the store (CNT-8). infra: **uuid** `user_id` across all app tables (migration
    `0003`, `ALTER … USING "user_id"::uuid`); `db/authSchema.ts` (user/session/account/verification, uuid
    ids); `auth/auth.ts` `makeAuth(db, {secret, baseURL})` (drizzle adapter; `generateId: () =>
    randomUUID()` — the string `"uuid"` form is silently unsupported in better-auth 1.6; the tanstack-start
    cookie plugin MUST be last); `drizzleSettings.ts` behind `settingsContract`; **deleted** the three
    in-memory adapters + the dev-judge and migrated every use-case/smoke test to pglite (shared
    `makeTestStores`/`testIds`; `vitest.setup.ts` frees each pglite WASM heap per test; `vite.config.ts`
    caps forks + 30s timeout so the herd of migrations fits the process). presentation-server: the
    composition root **requires** the 3 env vars (fail fast), builds ONE Neon handle shared by every store
    + `auth`, and `judge = liveJudge()` always; `currentUserId()` is now **async** (session cookie →
    `user.id`, else a 401 `Response`); new `session.ts` (`getSessionFn`) + `settings.ts`
    (`readSettingsFn`/`updateSettingsFn`); `await` added at every call site. presentation-UI:
    `routes/api/auth/$.ts` handler route; `lib/auth-client.ts`; `/signin`+`/signup` call the real
    `signIn`/`signUp` then `router.invalidate()`; `/settings` wires the goal stepper + identity + sign-out;
    `app-shell` shows the user's initial; `__root.beforeLoad` resolves the session once and a
    **`_authenticated` pathless layout** guards the 6 app routes (redirect to `/signin`). cleanup: deleted
    `mock/learner.ts` (MasteryState → `domain/card.js`). **Covers (wired):** STACK-3/4, CNT-8, app-route
    guards. **Verified:** both typecheck gates, `npm test` (282, pglite), `npm run build` (no
    secret/`drizzle-orm`/`neon`/server identifiers in the client bundle; the better-auth *client* is
    allowed). *Deferred still: LexTALE (SEED-4), per-user FSRS optimization (SEED-8), the counter's
    yesterday-delta (needs a persisted daily snapshot).*

**Key design conventions (follow in later slices):**
- **Lemmatizer port returns NLP forms; a pure domain rule decides the match** — keep wink out of the
  domain. `isLemmaMatch` backs cued/cloze grading (TIER-5) + the RL-2 presence check; RL-3 degeneracy uses
  a **separate** `SentenceAnalyzer` port (SOLID-4). One wink adapter implements both.
- **Scheduling types** (`FsrsCardState`/`FsrsReviewLog`) are declared **structurally in the domain**;
  ts-fsrs's own types are mapped only inside `tsFsrsScheduler`. Never leak a library into app/domain — put
  it behind a port (ARCH-3).
- **Session→userId is a presentation-server concern, not an application port** (STACK-4). Use-cases take a
  plain `userId: string`; `currentUserId()` (the ONLY auth-aware module) resolves it from the BetterAuth
  session. Every store is `userId`-scoped + multi-tenant.
- **One Drizzle-only persistence path.** No in-memory adapters; tests use pglite. A new persisted store
  follows the pattern: narrow application port → `Drizzle<X>` adapter + a shared `<x>Contract` run over
  pglite → thread through the composition root over the ONE shared Neon handle.
- Every test names the `spec/` ID it exercises.

**Deferred — do NOT build until pulled into scope (`PRAG-1`):** the **LexTALE** instrument + **per-user
FSRS optimization** (SEED-4/8; the latter needs `@open-spaced-repetition/binding`); the counter's
**yesterday-delta** (needs a persisted daily snapshot). *(BetterAuth (slice 20), the verdict memo (18),
and the placement-marks store (19) are wired — no longer deferred.)*

> **Status (2026-07-05):** backend slices 1–11 on **`master`**; UI slices 12 (design) + 13–20 (wiring)
> land on **`design/brand-ui-system`** and descendant wiring branches (currently `wire/betterauth-identity`
> — `git log` to confirm). **Every surface is wired and guarded**: `/`, `/review`, `/words`,
> `/onboarding`, `/settings` run on real use-cases behind a real **BetterAuth** session (slice 20); the
> verdict memo (18) and placement-marks store (19) persist to Neon. The app is **multi-tenant and
> secrets-required** — `DATABASE_URL` + `DEEPSEEK_API_KEY` + `BETTER_AUTH_SECRET` are mandatory, there are
> **no in-memory fallbacks**, and tests run against embedded pglite (`FakeJudge` is the one test-only
> double). Backend gate = `npm run typecheck` (NodeNext) + `npm test`; presentation gate = `npm run
> typecheck:web`; `npm run build` must keep server identifiers out of the client bundle. Test count moves
> each slice — do not trust any number written here; run `npm test`. Re-confirm state with `git log`,
> `npm test`, and `npm run dev` (needs the 3 env vars) at session start.

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