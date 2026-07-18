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

**Three codebases:** (1) the build-time content pipeline (`python/src/wikain/pipeline/`, uv), realizing
`docs/BUILD.md`; (2) the NLP + judge microservice (`python/src/wikain/{nlp,judge,service}/`) — one FastAPI
container holding the ONE spaCy engine and the DeepSeek client; (3) the v4 runtime (`src/`) — see `### v4
runtime (src/)` below. Every surface is wired and guarded. Do not assume a runtime piece is present;
check, and scaffold only when asked. What is **Deferred** is listed at the end of the runtime section.
*(v4 dropped the earlier single-user Electron shell for a web/multi-tenant backend — ignore any stale
"Electron" framing elsewhere.)*

### Build pipeline commands (Python — slice 30)

The pipeline is a **uv** project under `python/` (Python 3.13). Its gates mirror the TS ones and are the
same three ideas: `uv run ruff check .` (lint — a **rule gate, not a formatter**: no `E`/style rules, no
Prettier equivalent, exactly as `eslint.config.js` is on the TS side), `uv run mypy --strict src`
(typecheck), `uv run pytest` (test). **`build/out/` is still the artifact directory** and every artifact
keeps its old filename and JSON shape, so `src/infrastructure/db/seedCatalog.ts` reads `items.json`
unchanged.

```bash
cd python && uv sync
uv run wikain-pipeline stagea    # Stage A: assemble data/oxford_multisense_catalog.csv → build/out/_manifest_{A2,B1,B2,C1}.json + _quarantine.json
uv run wikain-pipeline feed      # Stage B: stage the next 25-item batch PER CEFR level → build/out/_pending_batch_<cefr>.json
uv run wikain-pipeline generate  # Stage B: write a markdown prompt per level → build/out/_prompt_<cefr>.md (NO API; paste into a frontier LLM)
uv run wikain-pipeline ingest    # Stage B: merge every _generated_batch_<cefr>.json + carried, Stage C, commit → build/out/batch_NNNN.json
uv run wikain-pipeline validate  # Stage C: §7.1 auto-asserts over build/out/items.json (or pass a path)
uv run wikain-pipeline combine   # concat all batch_*.json → build/out/items.json
```

### The Python service (`python/src/wikain/{nlp,judge,service}/`, slices 29+31)

One FastAPI container. `POST /analyze` (spaCy `en_core_web_sm`), `POST /judge` (DeepSeek V4 Flash),
`GET /versions` (`modelVersion`/`rubricVersion`, which key the verdict memo), `GET /healthz`. Bearer
`NLP_SERVICE_TOKEN` on every route but `/healthz`; `DEEPSEEK_API_KEY` lives here and nowhere else.

```bash
docker compose up nlp            # dev: http://localhost:8000
cd python && uv run ruff check . && uv run mypy --strict src && uv run pytest
```

**The load-bearing reason this exists:** Stage C validates content with the **same NLP engine the runtime
grades with**. The pipeline gets it by importing `wikain.nlp` in-process; the TS runtime gets it over HTTP.
That shared import, not a convention, is what stops the two from drifting — two engines would let an item
pass the build gate and still be bounced "word absent" at review, fabricating an `Again` and corrupting
FSRS (INV-2). It is why moving the pipeline to Python **forced** the runtime's NLP to move too.

## v4 runtime (`src/`) — STARTED 2026-06-30

Code lives in `src/` under a **clean/onion architecture** (`.claude/rules/`, esp. `ARCH-1..4`), built
**test-first** against `spec/` IDs with **vitest** (`06-tdd.md`). Layout: `src/domain/` (pure),
`src/application/` (use-cases + `ports/`), `src/infrastructure/` (adapters), `src/presentation/`
(TanStack Start app — own `tsconfig`, `npm run typecheck:web`, excluded from the NodeNext backend
gate). NodeNext ESM — relative imports carry `.js`; tests co-located `*.test.ts` (`TDD-4`).

**Persistence & secrets:** there is **one Drizzle-only
persistence path** — no in-memory adapters, no offline/URL-gated/key-gated fallbacks. The app **requires**
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `NLP_SERVICE_URL`, and `NLP_SERVICE_TOKEN`; the presentation
composition root throws at load if any is missing (fail fast). **`DEEPSEEK_API_KEY` is NOT one of them** —
it moved into the Python service. Tests run against embedded **pglite** (`makePgliteDb()`); there are now
**two** test-only doubles, `FakeJudge` and `FakeAnalyzer`, for the same reason — both stand in for an
out-of-process service (one of them paid). Run `npm run db:migrate:dev` once before boot, and have
`docker compose up nlp` running before `npm run dev`.

**`WIKAIN_DEV_TIER` pins the review tier** (`recognition|cloze|cued|free`, dev only — the composition root
throws if it is set in production, or set to a non-tier). It exists because driving one review state
otherwise means seeding a card at the matching mastery. It is resolved **once**, in the server composition
root, and injected into `runReviewPass` AND `resolveReviewPrompt` — never read per use-case. That is the
whole point: the two were previously pinned by a hardcoded `const tier = "cued"` copy-pasted into both, and
pinning one but not the other renders one tier's prompt while a *different* tier grades the answer, silently
(`resolveReviewTier` exists to prevent exactly that). Vite reads `.env` at startup — **restart the dev
server** after changing it; an edit alone does nothing.

**Migrations are per-environment.** `drizzle.config.ts` keys `out` off `NODE_ENV`, so generated SQL
lands in `drizzle/development/` or `drizzle/production/` (the `drizzle/` root no longer holds any).
`pglite.ts` runs the **development** set, so the suite and the dev DB share one shape. A migration
generated under the wrong `NODE_ENV` lands in the wrong tree and the other environment silently never
gets it — always go through the `:dev` / `:prod` scripts, never bare `drizzle-kit`.

```bash
npm test                   # vitest run (runtime test gate; pglite-backed, capped forks — see vite.config.ts)
npm run test:watch         # vitest watch
npm run typecheck          # NodeNext backend gate (src/** minus presentation)
npm run typecheck:web      # presentation tsconfig
npm run lint               # ARCH-1/ARCH-3/DIR-6/DIR-7 as errors — a rule gate, not a formatter
npm run dev                # the TanStack Start app (needs the 4 env vars + `docker compose up nlp`)
npm run db:migrate:dev     # apply drizzle/development/ migrations (once, before the DATABASE_URL path)
npm run db:seed:catalog:dev # load build/out/items.json into the global lexical_items table
```

**Implemented slices** (1–33; each byte-preserves earlier use-cases unless noted). Terse — read the
code + `spec/` IDs for detail. Slices 1–19 are one line each; 20–33 are grouped by theme below, because
what still matters about them is the rationale, not the sequence:

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
12. **Brand + design system** — full mock-driven UI (honest counter, no streaks). Two skills
    (`.claude/skills/brand/`, `.../design-system/`) are the **durable home** — read them, not this line.
    *(Was mock-only + warm-editorial; slices 13–20 wired it, slice 34 re-cast it to Instrument.)*
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

**Slices 20–33 — the wiring era.** Numbering stops here: what follows is why the code is shaped this way,
not a changelog. For a single slice's story, read `git log`.

**Identity + the single persistence path.** Real BetterAuth email+password (STACK-4) with full route
guards and per-user settings, plus the collapse to **one Drizzle-only** path — the three in-memory
adapters and the dev judge are deleted, so every test runs on pglite. Non-obvious: better-auth 1.6
**silently ignores** `generateId: "uuid"` — pass `generateId: () => randomUUID()`; the tanstack-start
cookie plugin MUST be last in the plugin array; `user_id` is `uuid` across every app table.
`currentUserId()` is async (session cookie → `user.id`, else a 401 `Response`) and is the ONLY auth-aware
module. pglite's herd of per-test migrations is why `vite.config.ts` caps forks + sets a 30s timeout and
`vitest.setup.ts` frees each WASM heap. The catalog then moved off the filesystem into a **global**
(un-scoped) `lexical_items` table so nothing on the serverless request path touches `node:fs`:
`DrizzleCatalog.hydrate(db)` does one `SELECT *` at instance load so `get` stays **sync** — NET-2's
instant bounce and the prompt render must not await — while `DrizzleWordSource` stays live SQL
(`WHERE cefr=? ORDER BY zipf_rank LIMIT`). `npm run db:seed:catalog:dev` at deploy is the only
surviving catalog `fs` read.

**Placement.** The published **LexTALE** instrument sits verbatim in `domain/placement/lextale.ts` (60
items, Lemhöfer & Broersma 2012 App. A; `scoreLexTale` = the averaged-%-correct yes-bias correction,
throws on a partial run). Scoring is **server-side** — `submitLexTaleFn` posts answers, never a score —
and `startSessionFn` reads the **persisted** band; it used to hardcode `"B2"`, which is what made a
learner's level not stick. Guards are a **three-layout chain**: `_public` (signed-in → out) →
`_authenticated` → `_onboarded` (`!onboarded` → `/onboarding`), with `/onboarding` outside `_onboarded`
under the inverse guard. The **nesting**, not a `pathname` test, is what makes the redirects loop-free.
Placement is re-runnable at `/placement`; `setCoarseLevelFn` exists as the band-only path because
`seedFirstSessionFn` deliberately bundles `recordCoarseLevel` with `seedIntroductions` — reusing it for a
retune would seed a fresh batch as a side effect of changing a setting. `recordCoarseLevel` writes
`lextaleScore: null`: the scalar is only meaningful as the SOURCE of the current band, so a later
self-report must not render "B1 — LexTALE 87.5%". Per-word marking is **not** re-offered outside
onboarding — marks are additive-only in v1, so a mistaken tap would be permanent.

**Loop polish.** All four review tiers are typeset as one **dictionary entry**; `resolveReviewPrompt`
carries `pos` on every arm (not a leak — MCQ distractors are POS-homogeneous by construction,
`docs/GENERATION_RULES.md §1`) and `intendedSense` on the free arm. The day boundary (SM-5b/CNT-2) runs on
the learner's own clock: pure `utcOffsetMinutesFor(ianaZone, at)` via `Intl` (DST-correct because it is
computed per-instant; sign matches `judgedPassLedger.localDayKey`), converted at the **composition edge**
so the read-models keep their tested `utcOffsetMinutes` input, and `updateSettings` rejects a junk zone —
a bad one would silently corrupt every day-bucket. RAT-5's three signals
(`retryCount`/`typoFixed`/`latencyMs`) are **persisted but not rated on**: their use is the v2 4-button
mapping, and retrofitting later would lose historical signal, which is the whole point of the requirement.
All three are **optional**, so an absent signal round-trips as `undefined` rather than a fabricated
`0`/`false` (`latencyMs` is absent on a memo hit — no call was made, so there is no round-trip to time;
`typoFixed` is omitted on MCQ, where tolerance cannot apply).

**Structure.** `DIR-1..7` in `.claude/rules/09-structure.md` were extracted from this work and are the
source of truth — read them there. What the rules do not record: the tree move was a pure `git mv` rename
map with the test baseline captured first, and the three boundary rules were **proven to bite** by
deliberately violating ARCH-1/ARCH-2/DIR-7 and watching each fail. `infrastructure/db/` needs no runtime
alias support — its cross-layer imports are all `import type`, erased before drizzle-kit or tsx resolve
them. ESLint is a **rule gate, not a formatter** (no Prettier, no style rules); tests are exempt from
`import/no-restricted-paths` because ARCH-1 governs *source* dependencies, and a use-case test composing
pglite + `FakeJudge` is the documented strategy.

**The Python cut-over.** Four slices, one indivisible change — the pipeline could not move to Python
without the runtime's NLP moving with it, or Stage C and the grader would validate against different
engines (the coupling note under `### The Python service` is the full argument). Timing made it free:
`items.json` was `[]`, so no wink-validated corpus had to be kept bug-compatible. `formsOf` was never a
separate capability — it just flattens each token's `normal` + `lemma`, which `analyze` already returns,
so behind ONE remote engine two ports would have meant **two RPCs for one sentence**. Hence
`ports/lemmatizer.ts` is gone, `SentenceAnalyzer.analyze` is the single NLP port, and `formsOf` moved into
`domain/review/grading.ts`. The async ripple reached `DeterministicReviewStrategy.grade`
(`Promise<boolean> | boolean`) — the shared skeleton of recognition/cloze/cued.
`docs/lexical-item.contract.json` is the DM-2 producer↔consumer field contract, asserted from **both**
sides of the language boundary; it replaced a TS↔TS assignability check that could no longer span it.
Two bugs found while porting, worth remembering: `_next_batch_index` counted files instead of taking
**max+1** (deleting a batch overwrote a survivor), and two judge few-shots were internally inconsistent —
hence `RUBRIC_VERSION = 2026-07-12`.

**The typed-cloze fit-set (`spec/13-cloze-fit-set.md`).** Binary cloze grading was falsely harsh on a valid
same-sense synonym (*pay* for *owe*), but accepting near-misses naively would teach false equivalence
(*lend* for *owe*). So the catalog carries a **classified** `cloze_fit_set` (`target |
same_sense_near_miss | different_sense_fit`) plus a `bounce_gloss`, and the pure `resolveClozeLane`
(`domain/review/clozeFitSet.ts`) decides: target → same-sense → different-sense → **typo** (restricted
Damerau–Levenshtein ≤ `CLOZE_TYPO_MAX_DISTANCE`, FIT-9) → wrong; fit-set membership beats typo distance.
A lane under `CLOZE_SOFT_BOUNCE_CAP` returns a **soft bounce** — no scheduler, no `ReviewLog`, card stays
due. It is a **third class**, deliberately NOT an INV-2 bounce. `bounce_gloss` ships **only on the bounce
response**, never pre-answer (`resolveReviewPrompt` is untouched). The client carries `priorSoftBounces`
so the use-case stays stateless (the RL-6 pattern). `cloze_heal_queue` has **no `user_id`** — it describes
catalog gaps, not learners — and `onConflictDoNothing` gives it both idempotency and its never-re-queue
memory. `DrizzleHealQueue` has no shared contract file: the port is write-only with one impl, so its
guarantees live in the SQL shape. Spec: `spec/13-cloze-fit-set.md` (`FIT-1..11`) + `docs/CLOZE_FIT_RUBRIC.md`.
*(Driven live end-to-end on 2026-07-17 — all four lanes, the cap, and the FIT-7 "no `ReviewLog`" rule
confirmed against the real catalog + Postgres. The lanes are no longer unexercised.)*

**`docs/AMMENDMENT.md` is a scratch file — NEVER cite it.** Its content is replaced wholesale each time
something new needs amending; it has already turned over once (typed-cloze fit-set → the Instrument
design system), which left 28 citations pointing at `§Ax` anchors in a document about an unrelated
subject. **Rule: when an amendment is adopted, migrate its content into the durable home** — `spec/` for
behavior, `.claude/skills/` for design, `docs/BUILD.md` for the pipeline — including the *rationale*,
then cite the stable ID (`FIT-6`, not `§A2`). The reasoning is the part that gets lost: it exists only
in the scratch file until someone moves it, and the next paste deletes it.

**The Instrument design system (v2.1).** The brand moved from warm-editorial to a **cool field with one
marigold signal** and three strictly-cast type voices (serif = the language in play, sans = the
instrument speaking, mono = the instrument measuring — every count, tag, tally, R value). The two skills
are the source of truth; do not restate values here. Non-obvious, and not recorded elsewhere:
**IBM Plex Mono has no variable build**, so `styles.css` imports two static weights (400 tags, 500
numerals) — a third weight needs a third import. `--radius` is a **flat 3-step scale** (tags 3 /
controls 6 / panels 8), not a `calc()` ramp, because the three shapes are independent decisions.
`shadcn add` re-introduces `shadow-*` and writes non-alias `src/presentation/...` imports — strip and
fix both every time (`DIR-7`). `marigold-wash` and `--mastery-new` have no value in the source design
and are **kept** because they are load-bearing in code; `marigold` is a signal tint, never a text color
on paper (`marigold-deep` is the on-paper variant), which is why the *Recognized* chip tints from one
and labels from the other.

**Mini-sessions (spec/14, `BAT-1..16`).** Review sessions now present as effort-unit batches with a
server-authoritative active batch (`session_state`), a Continue/Done seam, T-expiry "Welcome back"
rebuilds, and per-batch instrumentation (`review_batches`) — the spec file holds the behavior and the
migrated amendment rationale; do not restate it here. Non-obvious, and not recorded elsewhere:
**`WIKAIN_DEV_TIER` now threads into a THIRD place** — `buildSessionBatch` — because the batcher weighs
entries by tier; pinning the grader/prompt but not the batcher would budget recognition-weight batches
full of free-production cards. The **`seed_ledger` day-guard (`BAT-14`) also fixed a live bug**:
`startSession` seeded per-invocation, so every `/review` reload minted new intro cards — seeding now
runs at most once per learner-local day, and `startSessionFn` is gone (`getReviewSessionFn` is the
entry point; the `startSession` use-case survives untouched for the smoke tests). Batch progress keys
off `reviewWasRated` — the outcome discriminants, never a parallel flag — so the bar and FSRS ground
truth cannot drift (`BAT-7`). The **SEED-10 seed-rail gate is a pure `domain/scheduling/seedRail.ts`
(`evaluateSeedRail`) shared by `buildSessionBatch` AND `readDashboardSummary`** — so the dashboard's
"new" count is a read-only dry run of the seeder (SEED-6 pace ∩ real frontier supply, **gated by the
rail**), i.e. the exact number the next `/review` will introduce, `0` when the rail is closed for today
or the band is exhausted — never the bare `newIntroductionsAllowed` ceiling (which reads `NEW_PER_DAY`
even when nothing would seed). The two must not diverge, which is why the gate is one function, not two.

**Key design conventions (follow in later slices):**
- **Cross-layer imports use `~/*`; within-layer stay relative** (`DIR-7`). `npm run lint` enforces it, along
  with the ARCH-1 dependency rule — run it before committing; it is a gate, not a style pass.
- **The tree is grouped by subject below the layer boundary** (`.claude/rules/09-structure.md`, `DIR-1..7`).
  A new module goes in the subject folder it changes with — not the layer root, and not a kind-folder. Create
  a folder on the third file; keep cross-subject modules (and `application/ports/`) at the layer root.
- **One NLP port returns tokens; pure domain rules decide everything else** (revised in slice 32 —
  `Lemmatizer` is gone). `SentenceAnalyzer.analyze(text)` is the only NLP capability; `formsOf`,
  `isLemmaMatch` (cued/cloze grading, TIER-5, and the RL-2 presence check) and RL-3 degeneracy are all pure
  functions over the returned `NlpToken[]`. The engine is out-of-process, so **every NLP call is an RPC** —
  derive from the tokens you already have rather than asking again.
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
  (`db:seed:catalog:dev`). A read-model consumed synchronously on a hot path (`Catalog.get`) may **hydrate
  once** per instance (`SELECT *` at load) instead of a per-call round trip; a set-selection read
  (`WordSource`) stays live SQL.
- **The Python service is the one source of NLP + judge truth.** Anything that parses English or talks to
  DeepSeek belongs in `python/`, behind `/analyze` or `/judge` — never re-added to `package.json`. Its two
  TS-side adapters (`HttpNlp`, `HttpJudge`) are dumb transport: no retry (the judge retries in Python — a
  second layer would double-spend a paid call) and no fallback (they throw, because a fabricated verdict or
  an empty token list would corrupt FSRS).
- Every test names the `spec/` ID it exercises.

**Deferred — do NOT build until pulled into scope (`PRAG-1`):** **per-user FSRS optimization** (SEED-8;
needs `@open-spaced-repetition/binding`); **SEED-2's second LexTALE output** — the scalar driving FSRS
cold-start difficulty (`coldStartDifficulty` still keys off the item's own CEFR, and the spec gives no
offset magnitude); the counter's **yesterday-delta** (needs a persisted daily snapshot); an **un-mark**
path for `placement_marks` (its absence is why `/placement` does not re-offer per-word marking); the
**offline heal-merge tooling** (slice 33 ships only the runtime write — `heal-feed`/`heal-ingest` pipeline
commands, a `db:export:healqueue` script, and the heal-merge `fit_set_version` bump are the follow-up);
**length-scaled typo distance + the Hard-rating mapping** (v1 ships flat DL ≤ 1 → `Good`, spec/13 Deferred).

> **Status (2026-07-17):** slices 33–34 are on **`design/instrument-system`**; 1–11 landed on `master`
> and 12–32 on `design/brand-ui-system` + descendant wiring branches — confirm with `git log`, not with
> this line. **Gates.** TS: `npm run typecheck` + `npm run typecheck:web` + `npm run lint` + `npm test`.
> Python (from `python/`): `uv run ruff check .` + `uv run mypy --strict src` + `uv run pytest`. And
> `npm run build` must keep server identifiers out of the client bundle. Test counts move every slice —
> trust no number written anywhere; run them.
> **Two tests are knowingly red** — `resolveReviewPrompt.test.ts`'s two DM-2/DM-4 `intendedSense` cases.
> `resolveReviewPrompt.ts` deliberately serves `productive_meaning` as `intendedSense` ("intended senses
> generated by LLM are too long"), which the tests contradict. They are red because the swap is real, not
> because the tests are stale: **do not** edit them to match. DM-2 says the runtime renders a catalog field
> verbatim and never rewrites it, so if the glosses are too long that is a `GENERATION_RULES` fix. Resolve
> the contradiction, don't paper over it.
> **`build/out/items.json` is populated again** (the batch-0 reset is over; generation has resumed), so
> the "real catalog" smoke tests pass. Read `build/out/_done.json` for progress — and note it currently
> outruns the committed `batch_*.json`, so run `combine` before trusting `items.json` as the whole of it.
> Paths in the slice notes above predate the `DIR` refactor in places; module names are unchanged, only
> their folders.
> **Before boot:** `npm run db:migrate:dev` (through **`0007`**), `npm run db:seed:catalog:dev`, the 4
> env vars, and `docker compose up nlp`. **Not done:** the Cloud Run deploy + Vercel env wiring; the
> Docker image build is unverified.

## Build pipeline architecture (`python/src/wikain/pipeline/`, docs/BUILD.md)

A **three-stage offline batch pipeline** converting the multisense catalog
`data/oxford_multisense_catalog.csv` (`word,pos,cefr,sense_id,sense_hint,sense_zipf,global_zipf_rank`;
**5,745 rows**, A2–C1) into runtime lexical items. **Read `docs/BUILD.md` first** — it is the operational
spec, and its `§` references are cited inline in the code. *(v2 collapsed the earlier three-CSV NAWL +
Oxford-3000/5000 stack into one file; v3 split the manifest by CEFR + moved generation to manual
frontier-LLM free chats; v4 switched the input to the multisense catalog; **v5 (slice 30) rewrote the whole
pipeline in Python and deleted `build/*.ts`** — ignore any stale three-CSV / DeepSeek-API / single-sense /
TypeScript framing.)*

- **Stage A — `pipeline/stage_a.py` (deterministic, no LLM):** a single parse loop — `assemble(rows)`:
  normalize POS → scope-filter (content POS only) → validate CEFR/zipf → **quarantine the
  `NO_SENSE_FOUND`/`NO_HINT_FOUND` sentinel rows** → dedup on `(lemma,pos,synset)` (lower CEFR wins) →
  assign the per-`(lemma,pos)` ordinal `sense_id = {lemma}_{pos}_{NN}` (`_01` = most frequent sense) →
  group by CEFR, sort each by `zipf_rank` asc. The CSV's `sense_zipf`/`global_zipf_rank` are mapped to the
  carried names `zipf`/`zipf_rank` **at this read boundary**, so nothing downstream (the runtime
  `LexicalItem`, the `lexical_items` table, `seedCatalog.ts`) knows the column names changed. Each WordNet
  sense survives as its own item; the source synset key (not unique across headwords) rides along as
  manifest-only `synset` + `sense_hint` (generation inputs, NOT in the runtime item). Parsing is the stdlib
  `csv` module — RFC-4180 and quote-aware (the `sense_hint` gloss embeds commas). Emits four
  `_manifest_<cefr>.json` (carried only) + `_quarantine.json`, then prints a **gate summary for human review
  before any generation.**
- **Stage B — `pipeline/stage_b.py` (`feed`/`ingest`) + `generate.py` (NO API):** `feed` stages the next
  batch **per CEFR level** (`_pending_batch_<cefr>.json`); `generate` turns each into a markdown prompt
  (`_prompt_<cefr>.md`) the **user pastes into a frontier-LLM free chat**, hand-authoring the result into
  `_generated_batch_<cefr>.json`; `ingest` merges every present level, validates, and commits each level
  independently. Resumable via `_done.json`. No API key.
- **Stage C — `pipeline/stage_c.py`:** §7.1 auto-asserts using **`wikain.nlp` (spaCy)** — imported
  in-process, and **the same engine the runtime grades with** (it reaches it over HTTP). That shared import
  is the anti-drift mechanism; see the note under `### The Python service`. Reused by `ingest` and runnable
  standalone.

**The one rule that governs all build code (`docs/BUILD.md` §0, §8):** every item has **carried**
fields (facts from the source CSV — filled once by Stage A: `word, lemma, part_of_speech, sense_id,
cefr, zipf, zipf_rank`) and **generated** fields (produced by Stage B). **Stage B must never write,
overwrite, or infer a carried field.** `stage_a.py` stamps a `_carried_hash`; `ingest` reloads carried
from the manifest and rejects any stray/mutated key. Mixing the two is how factual hallucination
enters the data. The **field split itself** is pinned by `docs/lexical-item.contract.json`, asserted from
both sides of the language boundary (`pipeline/types_test.py` + `src/domain/lexicalItem.test.ts`) — that
file is what keeps producer and consumer honest now that they are different languages (DM-2).

- **Constants are single-source** in `pipeline/constants.py` (`BATCH_SIZE`, the explicit POS map, scope
  sets, the sentinel strings, provenance stamps `GEN_MODEL`/`GEN_SPEC_VERSION`, and the `Artifacts` paths)
  — never re-hardcode a literal elsewhere.
- **Halt, don't guess.** An unknown POS string, invalid CEFR, or non-numeric zipf **raises** rather
  than being silently bucketed (`docs/BUILD.md` §3.1 / §2.2 `[VALIDATE]`). `build/out/` is git-ignored
  generated output and is still where every artifact lands.

### Stage B generation loop — ACTIVE WORK (this is the task in progress)

Stage A is done — the **Python** run over the new CSV: **5,745 rows → 7 quarantined → 5,738 in-scope**
items across four `_manifest_<cefr>.json` (A2 1016 / B1 1421 / B2 1680 / C1 1621), **0 CEFR-collision
dedups**. (The old TS numbers — 4,933 / A2 847 / B1 1217 / B2 1430 / C1 1439 — are stale; the input file
changed.) The 7 quarantined are 3 out-of-scope POS (`need/modalv`, `ought/modalv`, `have/auxiliaryv`) and
4 sentinel rows carrying the literal `NO_SENSE_FOUND` / `NO_HINT_FOUND` (`ought` is in both sets).
Generation runs **25 items per CEFR level per feed** (4 × 25 = 100), **manually via frontier-LLM free
chats** (no API). **For current progress, read `build/out/_done.json`** (its length = items completed) — do
not trust any count here.

**Progress:** the input moved to `data/oxford_multisense_catalog.csv` and **the build was reset to batch
0** (2026-07-11) — the previous 100 hand-authored items were keyed to the old single-sense scheme, so
`build/out/{batch_*,_done,items,_generated_*}.json` were cleared (backed up under the session scratchpad)
and generation restarted from the most-frequent senses. **That reset is over: generation has resumed and
`items.json` is populated**, so the "real catalog" smoke tests pass again (they are
catalog-content-*agnostic* — slice 24's `smokeFixtureItem()` picks any fully-populated verb; they only
need a non-empty catalog). Read `_done.json` for the live count, and run `uv run wikain-pipeline combine`
after each ingest round — `_done.json` currently outruns the committed `batch_*.json`, so `items.json` is
a snapshot of what was combined, not of everything marked done.

**How generation works (v3 — manual, no API; v5 — now Python):** `generate` (`pipeline/generate.py`) reads
each `_pending_batch_<cefr>.json` and writes a markdown prompt `_prompt_<cefr>.md` whose content is
`build_prompt` = system + "\n\n" + user. `build_prompt` inlines the full text of
**`docs/GENERATION_RULES.md`** (the single source of truth for field content/quality — user-authored) +
the gold one-shot + the §7.1 hard constraints + the output contract. The **user pastes each markdown into
a frontier-LLM free chat**, then saves the returned `{"items":[…]}` to `_generated_batch_<cefr>.json`.
**Read `docs/GENERATION_RULES.md`** if editing the prompt — but **the prompt text is preserved byte-for-byte
across the Python port**; nothing about what the LLM is asked to produce changed.

**Checkpoint cadence:** rely on `ingest`'s built-in Stage C per level. Run **`uv run wikain-pipeline combine`
then `… validate` periodically and once at exhaustion** — `combine` makes the `items.json` snapshot,
standalone `validate` adds the catalog-wide duplicate-`sense_id` assert.

**Division of labor (agreed with the user — keep it):**
- **The user drives generation** — pasting `_prompt_<cefr>.md` into a frontier LLM and hand-authoring
  `_generated_batch_<cefr>.json` is a manual human step. `feed`/`generate`/`ingest` are cheap and
  need no API key, but generation itself is the user's job. Do not fabricate generated content yourself
  unless asked.
- **`feed` → `generate` → *user authors* → `ingest` is the loop.** `feed` is stateless (`manifest −
  _done`, per level); `generate` writes prompts (no state); only `ingest` writes `batch_NNNN.json` +
  appends to `_done.json`. `ingest` commits each level independently — a level that fails Stage C is
  recorded to `_review.json` and does not block the others.

**Generate to pass Stage C (`pipeline/stage_c.py`) on the first try — the non-obvious, code-enforced rules** (a `fail` blocks the whole batch; a `flag` still commits):
- **`model_sentence`:** embed the **bare lemma surface form verbatim** somewhere (guarantees the
  spaCy lemma-presence assert). **No first-person tokens** at all — `I / I'm / im / my / me / myself`.
- **`self_reference_prompt`:** must contain **no token whose spaCy lemma equals the target lemma**
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

**The wink en-US Americanization gotcha is GONE (slice 29).** It used to be that the `model_sentence`
lemma-presence assert compared wink's normalized form against the raw carried lemma, and wink Americanizes
spelling (`aesthetic`→`esthetic`, `archaeology`→`archeology`), so those lemmas were **impossible** to
satisfy — the documented workaround was `model_sentence: null` + a `_flags` reason. **spaCy does not
Americanize**, so no such lemma exists any more: write a normal sentence and it passes. Do not carry the
workaround forward, and do not expect those `_flags` to reappear.

**Flag visibility:** `ingest` routes only Stage C `flags` (e.g. shared-stem) to `_review.json`. An
item's own `_flags` live **inside the committed `batch_*.json`**, not `_review.json` — grep the batch files
for `_flags` to find them. `_review.json` is non-empty again — read it, don't assume a count.