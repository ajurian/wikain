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
started 2026-06-30) — see `### v4 runtime (src/)` below, now spanning the review loop, the real
DeepSeek judge, the counter, edit resolution, and a real Drizzle/Neon persistence adapter. **Parts of
the v4 web/multi-user runtime specified in `spec/` still do not exist** — no seeding, verdict memo,
BetterAuth adapter, or UI yet. Do not assume a runtime piece is present; scaffold it only when
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

Code lives in `src/` under a **clean/onion architecture** (`.claude/rules/`, esp. `ARCH-1..4`), built
**test-first** against `spec/` IDs with **vitest** (`06-tdd.md`). Layout: `src/domain/` (pure),
`src/application/` (use-cases + `ports/`), `src/infrastructure/` (adapters), `src/presentation/`
(TanStack Start app — own `tsconfig`, `npm run typecheck:web`, excluded from the NodeNext backend
gate). NodeNext ESM — relative imports carry `.js`; tests co-located `*.test.ts` (`TDD-4`). All slices
below are on **`master`** as one linear history (only branch — re-confirm with `git log`).

```bash
npm test               # vitest run (runtime test gate)
npm run test:watch     # vitest watch
npm run typecheck      # NodeNext backend gate (build/** + src/** minus presentation)
npm run typecheck:web  # presentation tsconfig
npm run dev            # the TanStack Start app
```

**Implemented slices** (each byte-preserving the earlier use-cases unless noted; external services
called out):

1. **Deterministic cued-production review** (architecture-proving; no external services). domain:
   `lexicalItem.ts` (DM-2; `.test.ts` type-asserts vs `build/types.ts` — DM-12/DM-4), `card.ts`
   (`MasteryState`/`Card`/`FsrsCardState`), `review.ts`, `rating.ts` (RAT-1), `mastery.ts` (SM-4),
   `grading.ts` (TIER-5 pure lemma-match). application: ports `catalog`/`cardRepository`/`scheduler`/
   `lemmatizer`; `submitCuedReview.ts` (grade→rate→schedule→promote→persist). infra: `winkLemmatizer`
   (DM-9), `tsFsrsScheduler` (ts-fsrs confined to adapter), `inMemoryCardRepository`, `JsonCatalog`,
   `composition.ts`. **Covers:** INV-1/3, SM-4, SM-6, RAT-1/8.

2. **Judged free-production** (cloud judge **faked**). domain: `constants.ts` (RL tunables), `verdict.ts`
   (JDG-4 + pure `passesGate` = sense AND grammar, JDG-2/5), `ruleLayer.ts` (RL-2/3/4 pure + `NlpToken`),
   `mastery.ts` `demoteOneRung` (SM-6/7). application: ports `judge` + `sentenceAnalyzer` (separate from
   `lemmatizer`, SOLID-4); `submitFreeProduction.ts` (rule-layer→judge→rate→demote-on-fail→persist;
   `bounce | judged`). `ReviewTier`=`cued|free`; `ReviewLog.scaffolded` (RAT-5). infra: `fakeJudge.ts`,
   `winkLemmatizer.analyze`, `tagalogLexicon.ts` (stub RL-4), `composeFreeProduction`. **Covers:** INV-2
   (bounce→no rating/schedule/log), INV-1, RL-1/2/3/4/6, JDG-2/5, SM-6/7, RAT-1/4/5.

3. **End-to-end loop orchestration** (`spec/11`; in-memory + faked judge). domain: `tier.ts` pure
   `selectTier(mastery)` (SM-1 table; pure fn not port — ARCH-2/COMP-3). application: `runReviewPass.ts`
   (load card→route→dispatch; `{tier, outcome}` union; `RunReviewPassDeps = SubmitFreeProductionDeps`).
   infra: `composeReviewPass`; `reviewPass.smoke.test.ts`. **Covers:** LOOP-1..5, SM-1, SM-6.

4. **SM-5 Fluent promotion + counter** (`spec/01` SM-5 + `spec/10`). Shared primitive = *distinct
   calendar days with a passing free judged production*, derived from persisted `ReviewLog`s (no
   Card-field drift; INV-4 filters non-free). domain: `judgedPassLedger.ts`, `fluentGate.ts`,
   `mastery.ts` `promoteOnJudgedPass`, `counter.ts` `isCounted` (CNT-2/3/6), 4 constants
   (`FLUENT_JUDGED_PASSES`=3, `FLUENT_MIN_STABILITY_DAYS`=21, `COUNTER_MIN_SPACED_PASSES`=2,
   `COUNTER_R_FLOOR`=0.70). application: `Scheduler.getRetrievability` + `CardRepository.logsForWord`/
   `listCards` ports; `readUsableCounter.ts` (live retrievability gate at read time). infra: ts-fsrs
   `get_retrievability`, `composeUsableCounter`. **Covers:** SM-5(a-d), SM-6/7/9, INV-4, CNT-2/3/4/6.

5. **Real DeepSeek cloud-judge + failure path** (`spec/06` JDG-10/11/6/4 + `spec/08` NET-*; **first
   external service**). Swaps `FakeJudge` for a DeepSeek V4 Flash HTTPS adapter behind the unchanged
   `JudgePort`; closes the cloud-failure half of INV-2. Tests stay offline (injected fake `http`).
   application: `ports/judge.ts` + `JudgeUnavailableError`/`JudgeUnavailableReason`
   (`transient`/`rate_limited`/`offline`/`invalid_response`, caught by use-case — ARCH-1);
   `submitFreeProduction` gains `unavailable` arm (transport failure → no rating/schedule/log, card stays
   due, ≠ bounce). `CLOUD_RETRY_COUNT`=1. infra: `deepSeekJudge.ts` (injectable `http`; JDG-6 JSON mode;
   backed-off retry NET-3/6; error classify NET-3/4/5; **never fabricates a gate** — 2xx missing gate →
   `invalid_response`; other-4xx → loud `Error`), `deepSeekConfig.ts` (**only** reader of
   `DEEPSEEK_API_KEY`, server-side NET-7), `deepSeekRubric.ts` (`RUBRIC_VERSION`, JDG-9/11), `liveJudge()`/
   `composeReviewPassLive()` (kept out of default wirings). **Covers:** INV-2 (cloud half), NET-3/4/5/6/7,
   JDG-2/4/5/6/10/11. *Deferred (UI): NET-2 "checking…", NET-5 pre-submit offline block.*

6. **Pure edit-resolution** (`spec/07` EDIT-*; pure domain, no consumer yet). domain: `editResolution.ts`
   pure `resolveEdits(rawSentence, replacements, correctedSentence)` → `{kind:"inline";edits} |
   {kind:"fallback";correctedSentence}`; reuses `Replacement`; in-module `REASON_PRIORITY`
   (`sense>grammar>collocation>register`, fixed domain rule not a constant). **Design (user-confirmed):**
   EDIT-4 fallback is **binary** — any edit whose `find` has 0 or ≥2 matches (empty=unresolvable)
   suppresses all inline render → whole-sentence fallback; empty `replacements` = clean inline.
   **Covers:** EDIT-2/3/4/5/6 (EDIT-1 met by `Replacement` shape). *Deferred (UI): EDIT-7 inline render +
   wink token-boundary snapping.*

7. **First persistence** (`spec/12` DM-5..DM-7, STACK-3/6; **first real DB**). Swaps
   `InMemoryCardRepository` for a Drizzle adapter behind the unchanged `CardRepository` (swap confined to
   composition root). Tests use embedded **pglite**, never Neon. infra: `db/schema.ts` (`cards` PK
   `(userId, senseId)`; append-only `review_logs` with `serial seq`; `mastery` its own column — DM-7/INV-3;
   FSRS = expanded `fsrs_`-prefixed `timestamptz` columns, no jsonb Date footgun),
   `drizzleCardRepository.ts` (dialect-agnostic `DrizzleDb`, same code on pglite+Neon; `save`=upsert, SM-2),
   `db/pglite.ts` + `db/neon.ts` (`neonDbFromEnv` reads `DATABASE_URL` server-side, NET-7/STACK-4),
   `composeReviewPassPersistent`. **Shared contract test** `cardRepositoryContract.ts` runs against both
   repos (SOLID-3 build-enforced). tooling: `drizzle.config.ts` + committed `drizzle/0000_init.sql` (same
   migrations pglite+Neon); `db:generate`/`db:migrate`. **Covers:** DM-5/6/7, SM-2, INV-4, multi-tenant.
   *Note: pglite suite adds ~12s (fresh DB/test). Deferred: memo table (DM-8); BetterAuth `userId` (STACK-4);
   live Neon CI wiring.*

8. **`Seen` on-ramp tiers** (`spec/03` TIER-1/2/5 + `spec/01` SM-3 + `spec/02` RAT-7). The missing rung;
   both tiers deterministic (recognition=exact match, cloze=lemma-match). domain: `onRampLedger.ts`
   (`nextSeenTier` — position derived from `ReviewLog`s, no new Card field; pure fold of SM-3's two-step +
   RAT-7's capped drop-back via sticky `dropbackUsed`); `grading.ts` `isRecognitionCorrect` (TIER-2 **exact
   identity**, not lemma-match); `mastery.ts` `promoteOnClozePass` (SM-3 `Seen→Recognized`, MCQ pass alone
   never promotes); `ReviewTier`=`recognition|cloze|cued|free` (INV-4 still filters `free`); 2 constants
   (`RECOGNITION_MCQ_OPTIONS`=4, `SEEN_CLOZE_DROPBACK_CAP`=1). application: `submitDeterministicReview.ts`
   — shared grade→rate→schedule→promote→log core (rule-of-three, PRAG-3), strategy-injected by
   `{tier, grade, promote}` (SOLID-2); `submitCuedReview` refactored onto it (API byte-identical); thin
   `submitCloze`/`submitRecognition` configs. `runReviewPass` routes `Seen` via `nextSeenTier` **before**
   `selectTier` (narrowed to `cued|free`). **Key insight:** RAT-7 drop-back is pure *routing* (which tier
   next), never a mastery change — lives entirely in `nextSeenTier`. infra: no new adapters;
   `onRamp.smoke.test.ts` (`Seen→Recognized→Productive`, FakeJudge zero calls). **Covers:** TIER-1/2/5,
   SM-3, RAT-7, SM-6, RAT-1/8, DM-6, INV-1/3. *Deferred (UI): MCQ assembly/shuffle; `New→Seen` intro
   (seeding).*

9. **First-session seeding + placement** (`spec/09`). *Creates* a user's cards. The three placement
   mechanisms (SEED-2/3) stay **structurally separate** (frontier band, per-word marks, list-stack source)
   — the LexTALE scalar can never mark/select words (type-enforced). domain (pure): `entryState.ts`
   (`introductionState` — placement-known→`Recognized` else `Seen`, SM-11/SEED-3), `introductionPacing.ts`
   (`newIntroductionsAllowed` — SEED-6/9; backlog cap = closed-form `floor(f/(1−f)·due)`), `coldStart.ts`
   (`coldStartDifficulty(cefr, band)`, SEED-8, FSRS[1,10]), 4 constants (`FIRST_SESSION_SEED_WORDS`=2,
   `NEW_PER_DAY`=5, `NEW_FRACTION_UNDER_BACKLOG`=0.30, `REQUEST_RETENTION`=0.90). application: narrow
   `WordSource` port; `Scheduler.newCard` + optional `ColdStart`; `seedIntroductions.ts` (pacing→select
   excluding carded→`newCard` cold-started→entry state→save; no new repo method). infra: `jsonWordSource.ts`
   (band bucket, list_rank, `sense_id` tiebreak), `tsFsrsScheduler` request_retention + cold-start,
   `composeSeeding`. **Covers:** SEED-1/2/3/5/6/7/8/9, SM-11, INV-3. *Deferred: LexTALE internals (SEED-4);
   per-user FSRS optimization (SEED-8, needs `@open-spaced-repetition/binding`); live session queue + UI.*

10. **Session-queue / due-word surfacing** (`spec/11` LOOP-1 step 1; additive — no new ports/adapters).
    domain (pure): `sessionQueue.ts` (`orderSessionQueue(cards, introSenseIds, now)` — due filter, reviews
    most-overdue-first (`senseId` tiebreak), fresh intros evenly interleaved via proportional even-merge,
    SEED-6; intro set passed explicitly). application: `startSession.ts` (`seedIntroductions`→`listCards`→
    `orderSessionQueue`, returns `{queue, seeded}`). infra: `composeSession`; `session.smoke.test.ts`.
    **Covers:** LOOP-1 (step 1), SEED-6/7. *Deferred: prompt resolution; per-calendar-day intro dedup;
    due-only repo query.*

11. **React deterministic review presentation** (`spec/03` TIER-1/2/5 render + `spec/11` LOOP-1;
    **STACK-2/5/7**). First `src/presentation/` layer: **TanStack Start** (Vite 7 + React 19) full-stack
    app; server functions run use-cases server-side so the DeepSeek key (NET-7) + DB (STACK-4) stay off the
    client. Scope = deterministic screen (recognition/cloze/cued). backend (TDD): `reviewRouting.ts` —
    extracted `resolveReviewTier(mastery, logs)` as **single source of truth** for routing (`runReviewPass`
    refactored onto it, behavior-identical) so shown-tier == graded-tier; `resolveReviewPrompt.ts` read-model
    (`{tier, …render fields}`, fail-loud on missing catalog field); `composeResolvePrompt`. presentation:
    TanStack Start under `srcDirectory: src/presentation`; `server/` = 3 `createServerFn`s (`startSession`/
    `resolvePrompt`/`submitReview`) over a process-shared in-memory repo + stubbed dev user (STACK-4 seam,
    BetterAuth deferred); `routes/review.tsx` drives the flow with shadcn-ui + Tailwind v4 + TanStack Query.
    tooling: Vite 7 / plugin-react 5 / **vitest 2→3** (vitest 2 pinned Vite 5); Tailwind v4; shadcn-ui
    (`@/*`→`src/presentation`); `dev`/`build`/`start`/`typecheck:web`; shadcn MCP (`.mcp.json`).
    **Covers:** render half of TIER-1/2/5 + LOOP-1 step 2. **Verified:** `npm run build` (server infra does
    NOT leak to client), `/review` SSR-renders, both typecheck gates + tests green. *NOT driven headlessly
    (the `createServerFn` HTTP click-path). Deferred (UI): free-production screen (real `liveJudge`) +
    NET-2/5; EDIT-7 inline render; MCQ shuffle-on-render; counter/daily-goal (CNT-7/8/9); real Neon +
    BetterAuth.*

12. **Brand + design system + full mock-driven UI** (design deliverable; renders `spec/` §3/§7/§9/§10/§11
    surfaces). **NOT a TDD runtime slice and NOT wired to infrastructure** — a complete UI/UX *design*; all
    data comes from `src/presentation/mock/*` (every module carries a `MOCK DATA — TO BE REPLACED` header;
    designed components never import `server/`). Brand = **warm editorial** (paper/ink neutrals, Manila-sun
    **amber** accent, **Fraunces** serif for words/sentences + **Inter** UI; honest counter, no
    confetti/streaks — encodes CNT-4/7/9). **Two skills authored** (leverage before UI work):
    `.claude/skills/brand/` (positioning, voice **microcopy catalog keyed to spec IDs**, palette) +
    `.claude/skills/design-system/` (tokens↔`styles.css`, component inventory, motion rules via
    `motion/react`, **spec-state→UI map** in `references/screen-states.md`). `styles.css` rewritten (brand
    oklch tokens + shadcn remap; `@fontsource-variable/fraunces|inter`). Routes: `/` dashboard (counter
    CNT-2/3/4, goal ring CNT-8, ladder SM-1), `/review` **chromeless** session covering **all 5 tiers + the
    full judged flow** (bounces RL-2/3/4, fallback offer TIER-7, cap-reveal+skip RL-6, "checking…" NET-2,
    pass/fail verdict, **inline edits EDIT-7 via the real pure `resolveEdits`**, unscored practice SM-8,
    offline NET-5, transient NET-3), `/onboarding` (SEED-1 win-before-calibration + per-word marking
    SEED-2/3), `/words`+`/words/$wordId` (retrievability vs `COUNTER_R_FLOOR`, equal-weight
    promotion/demotion history), `/signin`/`/signup`/`/settings` (visual-only; BetterAuth deferred). New ui
    primitives `textarea`/`badge`/`progress` + composites (`app-shell`, `counter-stat`, `goal-ring`,
    `mastery-chip`, `bounce-callout`, `checking-indicator`, `edited-sentence`, `verdict-panel`,
    `session-summary`, `wordmark`). Dep: **motion**. **Only cross-layer reuse:** `edited-sentence.tsx` calls
    the pure domain `resolveEdits` (presentation→domain, spec-true — not infra). **Verified:** `npm run
    build`, both typecheck gates, `npm test` (194) green; all 8 routes SSR-render. *Design liberty: `/review`
    compresses SM-3 spacing (a word's MCQ follows its intro same-session — commented). **The whole screen set
    is UNWIRED — the `mock/*` data must be replaced with server functions/use-cases before any of it is
    real.***

**Key design conventions (follow in later slices):**
- **Lemmatizer port returns NLP forms; a pure domain rule decides the match** — keep wink out of the
  domain. `isLemmaMatch` backs cued/cloze grading (TIER-5) + the RL-2 presence check; RL-3 degeneracy uses
  a **separate** `SentenceAnalyzer` port (SOLID-4). One wink adapter implements both.
- **Scheduling types** (`FsrsCardState`/`FsrsReviewLog`) are declared **structurally in the domain**;
  ts-fsrs's own types are mapped only inside `tsFsrsScheduler`. Never leak a library into app/domain — put
  it behind a port (ARCH-3).
- Every test names the `spec/` ID it exercises.

**Deferred — do NOT build until pulled into scope (`PRAG-1`):** verdict memo (`05`, MEMO-1 is a MAY);
LexTALE instrument + per-user FSRS optimization (SEED-4/8); the **BetterAuth (STACK-4) adapter** (presentation
stubs a dev user at the seam). *Note: the judged-review UI, EDIT-7 render, NET-2/5, and counter/goal
(CNT-7/8/9) now exist as **mock-only design** (slice 12) — the deferred work on them is **wiring to real
use-cases**, not designing them.*

**Natural next slice:** **wire slice 12's designed screens to the real backend** (replace `src/presentation/
mock/*` with server functions): the judged screen → `liveJudge`/`submitFreeProduction` (real NET-2/5 + memo),
the counter → the `readUsableCounter` read-model, the dashboard/session → `startSession`/`seedIntroductions`,
plus real MCQ shuffle-on-render and per-calendar-day intro dedup. The **Neon + BetterAuth swap** (single-point
swaps at the composition root — `composeReviewPassPersistent` + the `currentUser` seam) is the parallel track
for real multi-user persistence.

> **Status (2026-07-03):** runtime backend (slices 1–11) on **`master`**; the **brand + design-system + UI
> design (slice 12) lands on branch `design/brand-ui-system`** — mock-driven, unwired. Backend gate = `npm
> run typecheck` (NodeNext) + `npm test`; presentation gate = `npm run typecheck:web`. Test count moves each
> slice — do not trust any number written here; run `npm test`. Re-confirm state with `git log`, `npm test`,
> and `npm run dev` at session start.

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

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
