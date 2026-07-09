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
@.claude/rules/09-structure.md

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
against embedded pglite). Onboarding is the **mandatory** step after auth, and placement runs on the real
published **LexTALE** instrument (slice 22). **A few spec pieces remain deferred** — per-user FSRS
optimization (SEED-8), SEED-2's LexTALE→cold-start-difficulty output, and the counter's yesterday-delta
(needs a persisted daily snapshot). Do not assume a runtime piece is present; scaffold it only when asked.
*(Note: v4 dropped the earlier single-user Electron shell for a web/multi-tenant backend — ignore any
stale "Electron" framing elsewhere.)*

### Build pipeline commands

TypeScript runs directly via `tsx` (no compile step). The runtime phase added **vitest** (`npm test`)
as the test runner, and slice 28 added **ESLint** (`npm run lint`, flat config in `eslint.config.js`)
— it is a **rule gate, not a formatter**: there is still no Prettier and no style rules. The build
gates are `npm run typecheck` (covers `build/**` + `src/**`), `npm test`, and `npm run lint`.

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run stageA      # Stage A: assemble data/merged_oxford_a2c1_zipf.csv → build/out/_manifest_{A2,B1,B2,C1}.json + _quarantine.json
npm run feed        # Stage B: stage the next 25-item batch PER CEFR level → build/out/_pending_batch_<cefr>.json
npm run generate    # Stage B: write a markdown prompt per level → build/out/_prompt_<cefr>.md (NO API; paste into a frontier LLM)
npm run ingest      # Stage B: merge every _generated_batch_<cefr>.json + carried, Stage C, commit → build/out/batch_NNNN.json
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
    allowed). *(Slice 20's `UserSettings.levelBand` was dead data; slice 22 removed it.)*

21. **DB-backed catalog (serverless)** (`wire/betterauth-identity`). Moved the global lexical catalog off
    the filesystem so nothing on the serverless request path reads `node:fs` or depends on bundle file-tracing.
    New GLOBAL (not `user_id`-scoped) `lexical_items` table (`db/schema.ts`, migration `0004`, index
    `(cefr, zipf_rank)`); `db/seedCatalog.ts` (`seedLexicalItems` transactional replace) + `npm run
    db:seed:catalog` seeds it from `build/out/items.json` at **deploy** (the only surviving catalog `fs`
    read). Two adapters behind the existing ports: `DrizzleWordSource` (SQL `WHERE cefr=? ORDER BY zipf_rank
    LIMIT` — the frontier selector, async, zero ripple) + `DrizzleCatalog.hydrate(db)` (one `SELECT *` at
    instance load → in-memory Map → **sync** `get`, so NET-2 instant-bounce + prompt render stay local).
    Shared `catalogContract`/`wordSourceContract` over pglite; `db/lexicalItemMapping.ts` is the single
    row↔LexicalItem map. Composers now take **injected** `catalog`/`wordSource`; the presentation composition
    root hydrates both once (top-level `await`) over the ONE Neon handle. **Deleted** `catalog.ts` +
    `jsonWordSource.ts` (the `fromFile`/`ITEMS_PATH` fs path); `testStores` seeds the catalog into pglite and
    exposes `catalog`/`wordSource`/`items`. **Covers:** DM-2, SEED-5, STACK-3. **Verified:** both typecheck
    gates, `npm run build` (client bundle free of `drizzle-orm`/`neon`/server ids), and `npm test` green
    **except** the 5 smoke files that hardcode `lemma === "abandon"` (absent from the current 100-item
    catalog — a pre-existing fixture-word mismatch, not this slice; the generic seeding/session/words/
    placement/onboarding smokes pass over the DB-backed path). *Neon (`@neondatabase/serverless`, HTTP) + the
    DeepSeek HTTPS judge were already serverless-correct; `db/pglite.ts`'s `import.meta.url` is test-only.*

22. **Onboarding gate + LexTALE placement** (`wire/catalog-migration`). Onboarding produced **no persisted
    state** — the coarse level was discarded, `startSessionFn` hardcoded `FRONTIER_BAND = "B2"`, and nothing
    forced a new user through `/onboarding` (a signed-in user could also still load `/signin`). domain: the
    **published LexTALE instrument** verbatim (`lextale.ts` — 60 items / 40 words / 20 nonwords, Lemhöfer &
    Broersma 2012 Appendix A; `scoreLexTale` = the averaged-%-correct yes-bias correction, throws on a partial
    run); `frontierBandFromLexTale` + `isCoarseLevel` in `placement.ts`; `placementProfile.ts`
    (`PlacementProfile`/`DEFAULT_PLACEMENT_PROFILE`), `DEFAULT_FRONTIER_BAND`; **`levelBand` removed from
    `UserSettings`** (it was dead data + a second source of truth for the band). application (TDD):
    `ports/placementProfile.ts` (`PlacementProfileStore`), `readPlacementProfile`/`recordCoarseLevel`/
    `recordLexTaleResult`/`completeOnboarding` (idempotent — keeps the FIRST instant). `recordLexTaleResult`'s
    deps are `{ profile }` ONLY, so the type surface makes a SEED-3 violation impossible. infra: GLOBAL-shaped
    per-user `placement_profile` table (`user_id` PK, `frontier_band`, `lextale_score`, `onboarded_at`;
    migration `0005` **+ a hand-added backfill** stamping every user who already has a card, else the new guard
    re-onboards them); `DrizzlePlacementProfile` behind `placementProfileContract`; `settings.level_band`
    dropped. presentation-server: `placementProfileDeps()`; `SessionView` gains **`onboarded: boolean`**
    (resolved in `getSessionFn`'s existing handler — one extra query, NO extra round-trip, one consistent
    snapshot); `seedFirstSessionFn` now takes a **`CoarseLevel`** (not a client-supplied band string) and
    persists the band; `placementSlateFn` **drops its argument** and reads the persisted band; new
    `submitLexTaleFn` (posts ANSWERS — scoring is server-side; validator requires exactly 60), 
    `completeOnboardingFn`, `readPlacementProfileFn`; **`startSessionFn` reads the persisted band** (the fix
    that makes the learner's level stick). routes: **three layouts, one predicate each** — new `_public.tsx`
    (signed-in → `/` or `/onboarding`) wrapping `signin`/`signup`; `_authenticated.tsx` re-returns the narrowed
    session; new `_authenticated/_onboarded.tsx` (`!onboarded` → `/onboarding`) wrapping the 5 app routes;
    `/onboarding` sits OUTSIDE it with the inverse guard — that nesting, not a `pathname` test, is what makes
    the redirects loop-free. UI: `components/lextale-test.tsx` (3 practice + 60 items, both buttons `outline`
    so the layout doesn't bias the yes/no), a `Recommended` badge on the LexTALE card, `frontierBand` hoisted
    so a retune re-keys the slate, `finish()` → marks (best-effort) → `completeOnboardingFn` (must succeed) →
    `router.invalidate()` → `/`. **Covers:** SEED-1/2/3/4/5, app-route + public-route guards. **Verified:** both
    typecheck gates; `npm test` (5 pre-existing `"abandon"`-fixture smoke failures, unchanged); `npm run build`
    (no server ids in the client bundle). *Two `> [FLAG]`s added to `spec/09`: LexTALE's research-use licensing
    vs. a commercial product, and the non-partitioning CEFR cutoff table.*
    *Still deferred: SEED-2's **second** LexTALE output (FSRS cold-start difficulty — `coldStartDifficulty`
    still keys off the item's own CEFR), SEED-8 per-user FSRS optimization, and the counter's yesterday-delta.
    (Slice 22 shipped the `/settings` "Retune" button `disabled`; slice 23 wired it.)*

23. **Re-runnable placement — the `/placement` retune** (`wire/catalog-migration`). Slice 22 made placement a
    **one-shot** decision: the band was set once during onboarding, `/onboarding` bounces anyone already
    onboarded, and `/settings`' `Retune` shipped `disabled`. A learner whose words were consistently too hard
    or easy had no correction path. domain: `coarseLevelForBand` (the inverse of `frontierBandForCoarseLevel`,
    so the retune form pre-selects the current band; `null` for an unmappable band). application:
    `recordCoarseLevel` now writes **`{ frontierBand, lextaleScore: null }`** — the scalar is only meaningful
    as the SOURCE of the current band, so a self-report after an 87.5% run must not render "B1 — LexTALE 87.5%"
    (a no-op in onboarding, where the coarse level is always recorded before LexTALE can run). presentation-server:
    **extracted `server/placement.ts`** from `onboarding.ts` — the re-runnable placement surface
    (`readPlacementProfileFn`, `submitLexTaleFn`, `placementSlateFn`, `recordPlacementMarksFn`) answers to a
    different actor than the first-session-only trio (`seedFirstSessionFn`, `judgeFirstProductionFn`,
    `completeOnboardingFn`) that stayed behind (SOLID-1/CMP-2); new **`setCoarseLevelFn`** (POST, `isCoarseLevel`
    validator) is the **band-only** path — `seedFirstSessionFn` deliberately bundles `recordCoarseLevel` WITH
    `seedIntroductions`, so reusing it for a retune would seed a fresh batch as a side effect of changing a
    setting. presentation: `components/coarse-level-picker.tsx` (`COARSE_LEVEL_OPTIONS` + `CoarseLevelPicker`,
    extracted from onboarding's `LevelStep` — two call sites, one reason to change, PRAG-3); new route
    `_authenticated/_onboarded/placement.tsx` (`hub | lextale | result`, reusing `LexTaleTest` unchanged and
    running it chromeless like `/review`); `settings.tsx`'s button becomes `<Button asChild><Link to="/placement">`.
    Per-word marking is **not** re-offered — marks are additive-only in v1 (no un-mark), so a mistaken tap
    outside onboarding would be permanent. The `Recommended` badge now appears **only** when
    `lextaleScore === null`; a repeat visitor sees the retake caveat instead. **Covers:** SEED-2 (i), SEED-4.
    **No migration** (`placement_profile` already had every column). **Verified:** both typecheck gates;
    `npm test` (5 pre-existing `"abandon"`-fixture smoke failures, unchanged); `npm run build`; and a real
    `npm run dev` + Neon drive-through. *A third `> [FLAG]` added to `spec/09`: a LexTALE **retake** violates the
    instrument's naive-participant assumption and inflates the score — tolerable only because SEED-4 declares
    placement low-stakes, and the UI says so instead of dressing the number up as a measurement.*

24. **`/review` as a dictionary entry + green the smoke suite** (`wire/onboarding-placement`). Re-typesets all
    four review tiers (recognition MCQ, cloze, cued, free) as one **dictionary-entry** artifact so the same word
    read four ways looks like the same object. application: `resolveReviewPrompt` now carries **`pos:
    ControlledPos` on every arm** (the entry masthead; not a leak — MCQ distractors are POS-homogeneous by
    construction, `docs/GENERATION_RULES.md §1`) and **`intendedSense: string | null`** on the free arm (a real
    Stage-B field, DM-2/DM-4), dropping the unused `cefr` and cued's `selfReferencePrompt`. presentation: four new
    components — `entry-header.tsx` (`EntryHeader`/`HeadwordBlank`/`EntryDefinition`), `pos-label.tsx`,
    `blank-input.tsx` (grow-with-text underlined input + `BlankAnswer`), `word-option-list.tsx` (Radix radio MCQ,
    arrow/1–4 keys); `review.tsx` composes them per tier. tests: the **5 real-catalog smoke tests no longer
    hardcode `lemma === "abandon"`** — new `smokeFixtureItem()` in `testStores.ts` picks the first fully-populated
    **verb** and derives its sentences (pass/alt are constructed to embed the bare lemma without being a verbatim
    copy of `model_sentence`, which RL-3 bounces as degenerate; absent case uses a fixed lemma-free sentence). A
    catalog regeneration can no longer re-break them. **Covers:** DM-2, DM-4, TIER-1/2/5 render. **Verified:** both
    typecheck gates; **`npm test` fully green (340)**; `npm run build` (no server ids in the client bundle).
    *(Corrects the stale note below: `build/out/items.json` holds 100 items, not `[]`; the old 5 `"abandon"`
    failures were fixture-word drift, now removed at the root.)*

25. **User-local timezone + dead-mock removal** (`wire/onboarding-placement`). Wires the "separate calendar
    days" boundary (SM-5b/CNT-2) to the learner's own clock — previously the band was plumbed as
    `utcOffsetMinutes` but never driven (defaulted to UTC) and the `/settings` timezone "Change" button was a
    no-op. domain: `timezone.ts` — pure `utcOffsetMinutesFor(ianaZone, at)` (via `Intl.DateTimeFormat`, no I/O,
    DST-correct because it's computed per-instant) + `isValidTimeZone` (a `try { Intl… }` probe); sign matches
    `judgedPassLedger.localDayKey` (minutes to ADD to UTC, +east). application: `updateSettings` now rejects a
    junk timezone (a bad zone would silently corrupt every day-bucket). presentation-server: `usableCounterFn` +
    `dashboardSummaryFn` read the persisted `settings.timezone`, compute the offset for `now`, and pass
    `utcOffsetMinutes` (the timezone→offset conversion stays at the composition edge; the application read-models
    keep their tested `utcOffsetMinutes` input). presentation-UI: `settings.tsx`'s dead "Change" button becomes a
    real `<select>` of every `Intl.supportedValuesOf("timeZone")` zone (UTC/device/current always present) + a
    "use this device's time" shortcut. cleanup: **deleted** the design-time `mock/judge.ts` + `mock/catalog.ts`
    (runtime exports were referenced nowhere live); the two type-only survivors moved to `types/verdict.ts`,
    renamed off the `Mock*` prefix (`BounceKind`, `Replacement`), consumed by `bounce-callout`/`edited-sentence`/
    `verdict-panel`. **Covers:** SM-5b, CNT-2. **No migration** (`settings.timezone` already existed).
    **Verified:** both typecheck gates; `npm test` (346 green); `npm run build` (no server ids in the client bundle).

26. **RAT-5 review-log instrumentation** (`wire/onboarding-placement`). Persists the three richer per-review
    signals RAT-5 mandates "from day one" — even though v1 does not yet **rate** on them (their use is the v2
    4-button mapping; build persistence only, PRAG-1). Retrofitting later would lose historical signal, which
    is the whole point of the requirement. domain: `ReviewLog` (`review.ts`) gains three **optional** fields
    beside `scaffolded` — `retryCount?: number` (rule-layer bounces before this graded attempt, RL-6),
    `typoFixed?: boolean` (typo-tolerance correction — always absent/false in v1 since cloze tolerance is
    Deferred, spec/02), `latencyMs?: number` (graded-attempt latency; absent when unmeasured). All optional so
    an absent signal round-trips as `undefined`, never a fabricated 0/false. infra: three **nullable** columns
    on `review_logs` (`retry_count`/`typo_fixed`/`latency_ms`, migration `0006`, no backfill); the
    row↔ReviewLog map omits a field on a NULL read (mirrors `scaffolded`); `cardRepositoryContract` gains two
    round-trip asserts (present → values; absent → `undefined`). application: `submitFreeProduction` populates
    `retryCount = priorBounces ?? 0` and times the judge round-trip into `latencyMs` (**undefined on a memo
    hit** — no call was made, so there is no round-trip to time); `submitDeterministicReview` records
    `typoFixed: false` on the **typed** tiers (cloze/cued) where tolerance would apply and **omits** it for
    recognition (MCQ — not applicable). Every populated value is honest — measured or derived, never invented.
    **Covers:** RAT-5. **Verified:** both typecheck gates; `npm test` (348 green — 2 new contract asserts);
    `npm run build` (no server ids in the client bundle). `npm run db:migrate` applies `0006` against Neon
    before the column is written.

27. **Subject grouping below the four layers — the `DIR` rule** (`wire/onboarding-placement`). `ARCH-2` fixed
    the four layers but said nothing about what goes *inside* them, so every layer root had grown into a flat
    pile (`domain/` 26 modules, `application/` 30, `infrastructure/` 40+) with `grading.ts` beside `timezone.ts`
    and `drizzleSettings.ts` beside `tagalogLexicon.ts`. A `CMP-2` failure with no rule naming it. rules: new
    **`.claude/rules/09-structure.md`** (`DIR-1..6`) — group by **subject, not kind** (`review/`, `mastery/`;
    never `utils/`/`types/`/`services/`), with infrastructure carved out because there the **vendor seam IS the
    subject** (`db/`, `judge/`, `nlp/`, `persistence/`); create a folder **on the third file** and nest **one**
    level (`DIR-2`); **cross-subject modules stay at the layer root** (`DIR-3`); tests/doubles/contracts sit with
    what they serve (`DIR-4`); **framework-owned paths are exempt** (`DIR-5`); **no `index.ts` barrels** (`DIR-6`
    — a barrel re-exporting a server module is exactly how a Neon/DeepSeek id reaches the client bundle).
    tree: `domain/{review,mastery,scheduling,placement}`; `application/{review,session,placement,progress}`;
    `infrastructure/{persistence,judge,nlp,smoke}`; `presentation/components/review/`. **`application/ports/`
    stays a by-kind folder** — it is the layer's published abstract surface (`CMP-6`) and `ports/cardRepository`
    alone has **26 importers across six subjects**, so filing it under one would invent a false owner. `db/` and
    `auth/` did not move (`drizzle.config.ts` + `db:seed:catalog` name `db/`, and `db/pglite.ts` resolves
    `drizzle/` by its own depth). The 12 end-to-end smokes have no single impl — their unit under test is
    `composition.ts`, so they sit one level below it in `smoke/`, the **one sanctioned kind-folder**. Three
    corrections the rule forced against the plan: `entryState.ts` → `mastery/` (it returns a `MasteryState`;
    its reason to change is the ladder, not seeding); no `components/shell/` (usage showed `mastery-chip` has
    6 call sites and `wordmark` 3 subjects → both cross-subject, `DIR-3`); no `components/dashboard/` or
    `components/placement/` (2 files each, under `DIR-2`'s threshold). **Pure move, zero behavior change** —
    every import re-based by an exact `git mv` rename map, never a basename guess. **Verified:** both typecheck
    gates; **`npm test` 348 green at every one of the four commits** (the baseline was captured first, so any
    delta would have been the refactor's); `npm run build` + a grep of `dist/client` for `drizzle-orm`/`neon`/
    `pglite`/`DEEPSEEK_API_KEY`/`BETTER_AUTH_SECRET`/`DATABASE_URL` (0 hits); and a real `npm run dev` + Neon
    drive-through confirming the three-layout guard chain still 307s `/`, `/review`, `/words`, `/settings`,
    `/onboarding`, `/placement` → `/signin` while `/signin`+`/signup` render 200.

28. **`~/*` cross-layer alias + ESLint as a rule gate** (`wire/onboarding-placement`). Slice 27's subject
    folders pushed files deeper, so cross-layer specifiers started encoding the *importer's* depth
    (`../../../../domain/constants.js` — 8 of them, plus 38 three-deep). paths: new **`DIR-7`** — cross-layer
    imports use **`~/*`** (→ `src/*`), within-layer imports **stay relative** (a relative neighbour import is a
    true statement about cohesion and *should* break if the target moves away). Inside presentation, non-sibling
    imports use the existing shadcn **`@/*`**. Wired in `tsconfig.json` + `src/presentation/tsconfig.json`
    `paths` and mirrored by `vite.config.ts` `resolve.alias`; `STACK-1` amended. **`infrastructure/db/` needed no
    runtime alias support** — its cross-layer imports are all `import type`, erased before drizzle-kit/tsx ever
    resolve them (checked before committing to the approach). Deep chains: 8×4-deep and 30×3-deep → **zero**;
    the one remaining 2-deep is `domain/lexicalItem.test.ts` → `build/types.js`. Verified `~/…/schema.js` and
    `./schema.js` resolve to **one** module instance (a dedup failure would have double-loaded the Drizzle
    schema). lint: **ESLint 9 flat config** (`eslint.config.js`, `npm run lint` / `lint:fix`) — typescript-eslint
    + `eslint-plugin-import` + `react-hooks`. Not a formatter (no Prettier, no style rules); it turns
    `.claude/rules/` prose into **failing gates**: `import/no-restricted-paths` zones enforce **ARCH-1** on
    *resolved* paths (so `~/*` can't smuggle a violation past it), `no-restricted-imports` bans frameworks/drivers
    in `domain/` (**ARCH-3**), `index.ts` barrels (**DIR-6**), and relative layer escapes (**DIR-7**);
    `import/no-cycle` covers **CMP-4**. Tests are exempt from `no-restricted-paths` — **ARCH-1 governs source
    dependencies**, and a use-case test composing pglite/`FakeJudge` is the documented strategy. The 11 initial
    errors were all fixed, not silenced: 2 real React findings (`counter-stat`'s `setState`-in-effect → derived
    `display`; `review.tsx`'s `useMemo(…,[])` shuffle that lied about its deps → an honest lazy `useState`
    initializer), a dead import, an over-wide `any` in `stageA.ts` (properly generic now), and one **justified**
    single-line disable for `DrizzleDb`'s open generics. **Verified:** all four gates green (`typecheck`,
    `typecheck:web`, `lint`, `npm test` 348) + `npm run build` with a clean client bundle; and the three
    boundary rules were **proven to bite** by deliberately violating ARCH-1/ARCH-2/DIR-7 and watching each fail.
    *(Not covered by tests: the two React behavior changes — no component test harness exists.)*

**Key design conventions (follow in later slices):**
- **Cross-layer imports use `~/*`; within-layer stay relative** (`DIR-7`). `npm run lint` enforces it, along
  with the ARCH-1 dependency rule — run it before committing; it is a gate, not a style pass.
- **The tree is grouped by subject below the layer boundary** (`.claude/rules/09-structure.md`, `DIR-1..7`).
  A new module goes in the subject folder it changes with — not the layer root, and not a kind-folder. Create
  a folder on the third file; keep cross-subject modules (and `application/ports/`) at the layer root.
- **Lemmatizer port returns NLP forms; a pure domain rule decides the match** — keep wink out of the
  domain. `isLemmaMatch` backs cued/cloze grading (TIER-5) + the RL-2 presence check; RL-3 degeneracy uses
  a **separate** `SentenceAnalyzer` port (SOLID-4). One wink adapter implements both.
- **Scheduling types** (`FsrsCardState`/`FsrsReviewLog`) are declared **structurally in the domain**;
  ts-fsrs's own types are mapped only inside `tsFsrsScheduler`. Never leak a library into app/domain — put
  it behind a port (ARCH-3).
- **Session→userId is a presentation-server concern, not an application port** (STACK-4). Use-cases take a
  plain `userId: string`; `currentUserId()` (the ONLY auth-aware module) resolves it from the BetterAuth
  session. Every store is `userId`-scoped + multi-tenant.
- **One Drizzle-only persistence path.** No in-memory adapters, and no filesystem reads on the request
  path (slice 21 moved the catalog into Postgres too — serverless-safe). Tests use pglite. A new store
  follows the pattern: narrow application port → `Drizzle<X>` adapter + a shared `<x>Contract` run over
  pglite → thread through the composition root over the ONE shared Neon handle. Per-user tables are
  `user_id`-scoped; **global content** (`lexical_items`) is the one un-scoped table, seeded at deploy
  (`db:seed:catalog`). A read-model consumed synchronously on a hot path (`Catalog.get`) may **hydrate
  once** per instance (`SELECT *` at load) instead of a per-call round trip; a set-selection read
  (`WordSource`) stays live SQL.
- Every test names the `spec/` ID it exercises.

**Deferred — do NOT build until pulled into scope (`PRAG-1`):** **per-user FSRS optimization** (SEED-8;
needs `@open-spaced-repetition/binding`); **SEED-2's second LexTALE output** — the scalar driving FSRS
cold-start difficulty (`coldStartDifficulty` still keys off the item's own CEFR, and the spec gives no
offset magnitude); the counter's **yesterday-delta** (needs a persisted daily snapshot); an **un-mark**
path for `placement_marks` (its absence is why `/placement` does not re-offer per-word marking).
*(BetterAuth (20), the verdict memo (18), the placement-marks store (19), the **LexTALE instrument**
(SEED-4, slice 22), the `/settings` **"Retune"** entry point (slice 23), and the **user-local timezone**
(SM-5b/CNT-2, slice 25) are wired — no longer deferred.)*

> **Status (2026-07-09):** backend slices 1–11 on **`master`**; UI slices 12 (design) + 13–26 (wiring) + 27
> (the `DIR` tree refactor) land on **`design/brand-ui-system`** and descendant wiring branches (currently
> `wire/onboarding-placement`
> — `git log` to confirm). Since slice 27 every layer is grouped into **subject folders** — paths written in
> older slice notes above (`src/domain/grading.ts`, `src/infrastructure/drizzleCatalog.ts`, …) are stale; the
> module names are unchanged, only their folders. **Every surface is wired and guarded**: `/`, `/review`, `/words`,
> `/onboarding`, `/settings` run on real use-cases behind a real **BetterAuth** session (slice 20), and
> since slice 22 the guard is a **three-layout chain** (`_public` → `_authenticated` → `_onboarded`) that
> makes onboarding mandatory and bounces signed-in users off `/signin`/`/signup`; the
> verdict memo (18) and placement-marks store (19) persist to Neon. The app is **multi-tenant and
> secrets-required** — `DATABASE_URL` + `DEEPSEEK_API_KEY` + `BETTER_AUTH_SECRET` are mandatory, there are
> **no in-memory fallbacks**, and tests run against embedded pglite (`FakeJudge` is the one test-only
> double). Backend gate = `npm run typecheck` (NodeNext) + `npm test`; presentation gate = `npm run
> typecheck:web`; **`npm run lint`** enforces ARCH-1/ARCH-3/DIR-6/DIR-7 as errors (slice 28);
> `npm run build` must keep server identifiers out of the client bundle. Test count moves
> each slice — do not trust any number written here; run `npm test`. Re-confirm state with `git log`,
> `npm test`, and `npm run dev` (needs the 3 env vars) at session start.

## Build pipeline architecture (`build/`, docs/BUILD.md)

A **three-stage offline batch pipeline** converting the single word list
`data/merged_oxford_a2c1_zipf.csv` (`word,pos,cefr,zipf,zipf_rank`; 4,397 rows, A2–C1) into runtime
lexical items. **Read `docs/BUILD.md` first** — it is the operational spec, and its `§` references are
cited inline in the code. *(v2 collapsed the earlier three-CSV NAWL + Oxford-3000/5000 stack into this
one file; v3 split the manifest by CEFR and moved generation to manual frontier-LLM free chats — ignore
any stale three-CSV/DeepSeek-API/in-session framing.)*

- **Stage A — `build/stageA.ts` (deterministic, no LLM):** a single parse loop — `assemble(rows)`:
  normalize POS → scope-filter (content POS only) → validate CEFR/zipf → `sense_id = {lemma}_{pos}_01`
  → dedup on `sense_id` (lower CEFR wins) → group by CEFR, sort each by `zipf_rank` asc. Emits four
  `_manifest_<cefr>.json` (carried only) + `_quarantine.json`, then prints a **gate summary for human
  review before any generation.**
- **Stage B — `build/stageB.ts` (`feed`/`ingest`) + `generate.ts` (NO API):** `feed` stages the next
  batch **per CEFR level** (`_pending_batch_<cefr>.json`); `generate` turns each into a markdown prompt
  (`_prompt_<cefr>.md`) the **user pastes into a frontier-LLM free chat**, hand-authoring the result into
  `_generated_batch_<cefr>.json`; `ingest` merges every present level, validates, and commits each level
  independently. Resumable via `_done.json`. No API key.
- **Stage C — `build/stageC.ts`:** §7.1 auto-asserts using `wink-nlp` (the same en-US NLP the runtime
  grades with). Reused by `ingest` and runnable standalone.

**The one rule that governs all build code (`docs/BUILD.md` §0, §8):** every item has **carried**
fields (facts from the source CSV — filled once by Stage A: `word, lemma, part_of_speech, sense_id,
cefr, zipf, zipf_rank`) and **generated** fields (produced by Stage B). **Stage B must never write,
overwrite, or infer a carried field.** `stageA.ts` stamps a `_carried_hash`; `ingest` reloads carried
from the manifest and rejects any stray/mutated key. Mixing the two is how factual hallucination
enters the data.

- **Constants are single-source** in `build/constants.ts` (`BATCH_SIZE`, the explicit POS map, scope
  sets, provenance stamps `GEN_MODEL`/`GEN_SPEC_VERSION`) — never re-hardcode a literal elsewhere.
- **Halt, don't guess.** An unknown POS string, invalid CEFR, or non-numeric zipf **throws** rather
  than being silently bucketed (`docs/BUILD.md` §3.1 / §2.2 `[VALIDATE]`). `build/out/` is git-ignored
  generated output.

### Stage B generation loop — ACTIVE WORK (this is the task in progress)

Stage A is done (**4,391** in-scope items across four `_manifest_<cefr>.json` — A2 705 / B1 1059 /
B2 1289 / C1 1338; 3 quarantined, 3 CEFR-collision dedups). Generation runs **25 items per CEFR level
per feed** (4 × 25 = 100), **manually via frontier-LLM free chats** (no API). **For current progress,
read `build/out/_done.json`** (its length = items completed) — do not trust any count here.

**Progress (as of slice 24, 2026-07-09):** `build/out/items.json` holds **100 items** (the first four
batches; `_done.json` is the source of truth for the exact count — read it, do not trust this number). The
word set was regenerated and **no longer contains `abandon`**. The `src/infrastructure/*.smoke.test.ts`
"real catalog" tests are now **catalog-content-agnostic** (slice 24: `smokeFixtureItem()` picks any
fully-populated verb), so the **entire suite is green** — they no longer depend on a specific lemma being
present. Continue generation via the manual loop below, then `npm run combine` to refresh `items.json`.

**How generation works now (v3 — manual, no API):** `generate` (`build/generate.ts`) reads each
`_pending_batch_<cefr>.json` and writes a markdown prompt `_prompt_<cefr>.md` whose content is
`buildPrompt` = system + "\n\n" + user. `buildPrompt` inlines the full text of
**`docs/GENERATION_RULES.md`** (the single source of truth for field content/quality — user-authored) +
the gold one-shot + the §7.1 hard constraints + the output contract. The **user pastes each markdown into
a frontier-LLM free chat**, then saves the returned `{"items":[…]}` to `_generated_batch_<cefr>.json`.
**Read `docs/GENERATION_RULES.md`** if editing the prompt — but the prompt text is intentionally
preserved byte-for-byte; only the return shape changed (string, not chat-message array).

**Checkpoint cadence:** rely on `ingest`'s built-in Stage C per level. Run **`npm run combine` then
`npm run validate` periodically and once at exhaustion** — `combine` makes the `items.json` snapshot,
standalone `validate` adds the catalog-wide duplicate-`sense_id` assert.

**Division of labor (agreed with the user — keep it):**
- **The user drives generation** — pasting `_prompt_<cefr>.md` into a frontier LLM and hand-authoring
  `_generated_batch_<cefr>.json` is a manual human step. `npm run feed`/`generate`/`ingest` are cheap and
  need no API key, but generation itself is the user's job. Do not fabricate generated content yourself
  unless asked.
- **`feed` → `generate` → *user authors* → `ingest` is the loop.** `feed` is stateless (`manifest −
  _done`, per level); `generate` writes prompts (no state); only `ingest` writes `batch_NNNN.json` +
  appends to `_done.json`. `ingest` commits each level independently — a level that fails Stage C is
  recorded to `_review.json` and does not block the others.

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
- **Carried fields:** never emit them in `_generated_batch_<cefr>.json` — `ingest` reloads carried fields
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
not `_review.json` — grep the batch files for `_flags` to find them. After the v2 batch-0 reset
`_review.json` is `[]`; the Americanization nulls (`aesthetic`, `archaeology`, …) will recur on the
same lemmas when regenerated.