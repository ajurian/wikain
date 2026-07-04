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
2026-06-30) — see `### v4 runtime (src/)` below — now spanning the review loop, first-session seeding,
the real DeepSeek judge, the usable-words counter, edit resolution, a real Drizzle/Neon persistence
adapter, and a **wired** TanStack Start UI (the `/review` session + dashboard counter run on real
use-cases). **Parts of the v4 web/multi-user runtime specified in `spec/` still do not exist** — no
verdict memo, no BetterAuth adapter, and several dashboard/onboarding/words surfaces are still
mock-only design (slice 12). Do not assume a runtime piece is present; scaffold it only when asked.
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
gate). NodeNext ESM — relative imports carry `.js`; tests co-located `*.test.ts` (`TDD-4`). Slices
1–11 are on **`master`**; the UI slices — 12 (design), 13–14 (backend wiring) — live on
**`design/brand-ui-system`** and its descendant wiring branch (re-confirm with `git log`).

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

13. **Wire `/review` to the real backend** (branch `design/brand-ui-system`; the first *wired* slice on
    the mock UI). Replaces `src/presentation/mock/session.ts` with real server functions driving the whole
    review loop — deterministic tiers AND the judged free-production flow — offline via a **key-gated dev
    judge** (`devJudge.ts` `devVerdict`; real `liveJudge` when `DEEPSEEK_API_KEY` is set). backend (TDD):
    extracted `checkFreeProductionRuleLayer.ts` (single source of truth for the rule-layer bounce, reused
    by `submitFreeProduction` + the new `ruleCheckFn`); `runReviewPass` returns `previousMastery` (honest
    from→to moves); pure `presentReviewOutcome.ts` DTO builder (result→serializable view-model, maps the
    verdict's single feedback onto each edit); `resolveReviewPrompt` free arm reveals `lemma`/`pos`/`cefr`.
    presentation-server: judge key-gated in `server/composition.ts`; `server/review.ts` gains `ruleCheckFn`
    (instant judge-free rule pre-screen so "checking…" never precedes a bounce — NET-2; RL-6 model sentence
    attached server-side only at the cap) + reworked `submitReviewFn`. `routes/review.tsx` rewritten
    server-driven via TanStack Query (MCQ Fisher-Yates shuffle-on-render, NET-5 `navigator.onLine`
    pre-check, dropped the New→Seen intro card per user scope). **Bug fixed:** `startSession` captured `now`
    before `seedIntroductions` captured a later one → fresh intros fell past the queue's `due<=now` filter
    (empty first session); now threads one `now`. **Covers (wired):** LOOP-1..5, TIER-1/2/5 grade,
    RL-2/3/4/6, INV-2 (bounce+unavailable), NET-2/3/5, EDIT-7 (via the pure `resolveEdits`). **Verified:**
    both typecheck gates, `npm test`, `npm run build` (no server leak in client bundle), `/review` SSR +
    an offline click-path driver. *Deferred: verdict memo; live Neon + BetterAuth; per-calendar-day intro
    dedup; MCQ headless click-path test.*

14. **Wire the real DB + usable-words counter** (branch `design/brand-ui-system`; additive — **no new
    domain/application logic**). (a) **DB is URL-gated** at the presentation composition root
    (`server/composition.ts`): `DATABASE_URL` set → `new DrizzleCardRepository(neonDbFromEnv())` (durable;
    the handle is built **synchronously** so no async composition — run `npm run db:migrate` once), unset →
    the in-memory repo (zero-config offline dev). ONE shared binding all dep-factories close over, mirroring
    the `DEEPSEEK_API_KEY` judge gate. (b) **Counter wired**: new `counterDeps()` + `server/counter.ts`
    `usableCounterFn` call the existing `readUsableCounter`; `routes/index.tsx` renders it via TanStack
    Query. **Dropped the yesterday-delta** (`previous`) — no daily snapshot is persisted, so no fabricated
    comparison (honesty over a fake number). Correctness over the Drizzle adapter is guaranteed by the
    shared `cardRepositoryContract` (SOLID-3 substitutability), so **no new tests**. **Covers (wired):**
    CNT-2/3/4/6, STACK-3 (the Neon swap). **Verified:** both typecheck gates, `npm test` (206), `npm run
    build` (no `DATABASE_URL`/`neon`/`drizzle`/`readUsableCounter` in the client bundle), `/` SSR renders
    the **real** count (0 on a fresh store — honest; CNT-2 needs ≥2 spaced-day judged passes). *Still mock
    (need new read-models / unstored data): goal ring CNT-8, ladder SM-1, Today/queue counts, and the
    `app-shell` user chrome (the `132` header is the BetterAuth-deferred mock user, STACK-4); the
    yesterday-delta needs a persisted daily snapshot.*

15. **Wire the dashboard read-models** (branch `wire/review-db-counter`; additive — one read-model
    use-case, no new business rules). Replaces the dashboard's `mock/learner.ts` (`MOCK_LADDER/LEARNER/
    QUEUE`) with a real read-model mirroring `readUsableCounter`. domain (TDD, pure): `masteryLadder.ts`
    (`tallyMastery` — SM-1 distribution over the four **carded** rungs, `New` omitted as a card-less
    pre-state); `judgedPassLedger.ts` gains `judgedUsesOnDay` (CNT-8 today's free-judged **uses**, not
    distinct days — reuses the module's `isJudgedPass`/`localDayKey`); `constants.ts` adds
    `DAILY_GOAL_DEFAULT`=5 (CNT-8; fixed until a learner-adjustable setting persists — STACK-4). application
    (TDD): `readDashboardSummary.ts` — Input/Deps(`{cards}` only, **no scheduler**)/Result triple returning
    `{ladder, dueReviews, newIntroductions, sentencesToday, dailyGoal}`; `dueReviews` reuses the
    `sessionQueue` due predicate (`fsrs.due<=now`), `newIntroductions` reuses `newIntroductionsAllowed` (the
    pacing **allowance** "up to N new" — no per-day intro ledger, so not a remaining-today figure), a pure
    read (never seeds/writes). infra: `composeDashboardSummary`. presentation-server: `dashboardDeps()` +
    `server/dashboard.ts` `dashboardSummaryFn` (byte-mirrors `server/counter.ts`). presentation-UI:
    `routes/index.tsx` swaps the `MOCK_*` imports for a `dashboard-summary` TanStack Query (zero-guarded
    ladder bar + empty-state copy for a fresh user); `app-shell.tsx` header counter now reads the wired
    `usable-counter` query (shared key dedupes) instead of `MOCK_LEARNER.usableWords`. **Covers (wired):**
    SM-1 (ladder), CNT-8 (goal ring: real sentences-today + fixed default goal), SEED-6 (Today due/new).
    **Verified:** both typecheck gates, `npm test` (221), `npm run build` (no server/db identifiers in the
    client bundle), a real-composition integration drive (seed→read: ladder `Seen=2`, `dueReviews=2`, pacing
    drops `newIntros` to 0 under backlog), `/` SSR 200. *Still mock/deferred: learner-**adjustable** daily
    goal (settings+BetterAuth); counter yesterday-delta (needs a daily snapshot); per-calendar-day intro
    dedup; `/words`+`/onboarding` wiring; `app-shell` mock **user identity** (name/email). `mock/learner.ts`
    stays for `/words` + the mock user (`MasteryChip` still sources `MasteryState` from it).*

16. **Wire the `/words` per-word read-models** (branch `wire/words-read-models`; additive — one new pure
    domain helper + two read-models, no new business rules). Replaces `/words` + `/words/$wordId`'s
    `mock/learner.ts` (`MOCK_WORDS`/`MOCK_R_FLOOR`) with real read-models mirroring `readDashboardSummary`.
    domain (TDD, pure): `masteryHistory.ts` (`deriveMasteryHistory(logs, offset)` — **replays** a word's
    ReviewLogs oldest→newest into `{day, tier, outcome, moved?}`, composing the **existing** transitions
    `promoteOnClozePass`/`promoteOnCuedPass`/`promoteOnJudgedPass`/`demoteOneRung` + the `qualifiesForFluent`
    gate fed by `distinctPassDays`+`fsrs.stability`; the "before" state is inferred from the first log's tier
    per `reviewRouting`); `judgedPassLedger.ts` **exports** `localDayKey` for reuse. application (TDD):
    `readWordsList.ts` (`{cards, scheduler, catalog}` deps → per-word `{senseId, lemma, mastery,
    retrievability, aboveFloor, counted, judgedPassDays}` via `distinctPassDays`+`getRetrievability`+
    `isCounted`; fail-loud on missing catalog) and `readWordDetail.ts` (adds catalog fields + `history`;
    returns **`null`** when the user has no card — a reachable-but-empty URL — vs fail-loud on a missing
    *catalog* entry; `New`/mastery filtering stays client-side). **Design (user-confirmed): the free-production
    `sentence` text is DROPPED from history for v1** — `ReviewLog` never persists it (DM-6), so showing it
    would need a schema change; honesty over fabrication (mirrors slice 14's dropped yesterday-delta). The
    `moved` from→to survives (replayed). infra: `composeWords` (one composer, both read-models share the deps
    shape); `words.smoke.test.ts` (seed→climb Seen→Recognized→read over real composition). presentation-server:
    `wordsDeps()` + `server/words.ts` (`wordsListFn` GET; `wordDetailFn` GET + `senseId` validator, mirroring
    `resolvePromptFn`). presentation-UI: `routes/words.index.tsx` + `words.$wordId.tsx` swap the `MOCK_*`
    imports for `words-list`/`word-detail` TanStack Queries (empty/loading/not-found states; `words.index`
    imports `COUNTER_R_FLOOR` from domain for the footer copy — presentation→domain, spec-true). `mock/learner.ts`
    **trimmed** to just `MasteryState` + `MOCK_LEARNER` (the mock user for `/settings`+`app-shell`); the dead
    dashboard mocks (`MOCK_WORDS`/`MOCK_R_FLOOR`/`MOCK_LADDER`/`MOCK_QUEUE`) are gone. **Covers (wired):**
    CNT-1/2/3 (`/words`), SM-3..SM-7 (history replay). **Verified:** both typecheck gates, `npm test` (243),
    `npm run build` (no `readWordsList`/`readWordDetail`/`deriveMasteryHistory`/`JsonCatalog`/db identifiers in
    the client bundle), `/words`+`/words/$wordId`+`/` SSR 200 (`/words` shows the honest fresh-user empty state).
    *Still mock/deferred: `/onboarding`+`/settings` wiring; `app-shell` mock **user identity**; sentence text in
    history (arrives with the verdict memo DM-8/MEMO-1).*

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
stubs a dev user at the `currentUser` seam). *Note: `/review` is **wired** (slices 13–14) — the judged
loop, EDIT-7 render, NET-2/3/5, and the usable-words counter (CNT-2/3/4/6) run on real use-cases/DB. The
**dashboard `/` is now wired too** (slice 15): SM-1 ladder, CNT-8 goal ring (real sentences-today, fixed
default goal), and the SEED-6 Today due/new counts. **`/words`+`/words/$wordId` are now wired too** (slice
16): per-word CNT-1/2/3 (counted-status + live retrievability) and the SM-3..SM-7 mastery history (replayed
from logs; sentence text dropped for v1). Still **mock-only design** (slice 12, awaiting wiring): the
`app-shell` user identity (name/email) and the `/onboarding`/`/settings` routes.*

**Natural next slice:** **wire `/onboarding` → `seedIntroductions`** (real SEED-1/2/3 placement) — the last
mock-driven learning surface. It is heavier than the read-model slices: it needs a new POST server fn, a
coarse-level→`frontierBand` mapping, wizard state lifted out of the per-step components, and confronts the
SEED-1 "first written sentence" win vs. the `Seen`-tier cards it seeds (LexTALE SEED-4 stays deferred).
Cheaper adjacent wins now unlocked by the read-model pattern: the counter's yesterday-delta + the daily-goal
knob both need **persisted per-day / per-user state** (a daily snapshot; a user setting) — that state arrives
with the **BetterAuth swap** (only `currentUser.ts` changes), which also unlocks real multi-user persistence
over the already-wired Neon DB and the `app-shell`/`/settings` real user identity. The **verdict memo**
(DM-8/MEMO-1) is the remaining judged-loop piece (and adds the sentence text back to `/words` history).

> **Status (2026-07-04):** runtime backend (slices 1–11) on **`master`**; the UI slices — **12 (design),
> 13–16 (backend wiring)** — land on **`design/brand-ui-system`** and descendant wiring branches (currently
> `wire/words-read-models`; `git log` to confirm). `/review`, the `/` dashboard (counter + ladder + goal ring
> + Today counts), **and `/words`** are wired to real use-cases (Neon when `DATABASE_URL` is set, else
> in-memory; DeepSeek when `DEEPSEEK_API_KEY` is set, else the offline dev judge). Backend gate = `npm run
> typecheck` (NodeNext) + `npm test`; presentation gate = `npm run typecheck:web`. Test count moves each slice
> — do not trust any number written here; run `npm test`. Re-confirm state with `git log`, `npm test`, and
> `npm run dev` at session start.

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