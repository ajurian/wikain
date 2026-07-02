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

The runtime phase has begun. Code lives in `src/` under a **clean/onion architecture** (governed by
`.claude/rules/`, esp. `ARCH-1..4`), built **test-first** against `spec/` IDs with **vitest**
(`06-tdd.md`). Layout: `src/domain/` (pure, imports nothing outward), `src/application/` (use-cases +
`ports/` interfaces), `src/infrastructure/` (adapters). `src/presentation/` does not exist yet.
NodeNext ESM — relative imports carry `.js` extensions; tests are co-located `*.test.ts` (`TDD-4`).

```bash
npm test            # vitest run (the runtime test gate)
npm run test:watch  # vitest watch
```

**All four runtime slices below are now merged to `master`** as one linear history (the per-slice
`runtime-*` branches were deleted post-merge, 2026-06-30) — `master` is the only branch. Re-confirm
with `git log` at session start.

**Implemented — the deterministic cued-production review slice.** This is the architecture-proving
vertical slice; it needs **no external services** (no DeepSeek/Neon/BetterAuth/network):
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

**Also implemented — the judged free-production slice** (still **no external services** —
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
  JDG-2/5, SM-6/7, RAT-1/4/5.

**Also implemented — the end-to-end loop orchestration slice** (`spec/11`; still **no external
services** — in-memory repo + faked judge). This is the integration layer that composes the two slices above into the single entry
point the UI will call. The two existing use-cases stay **byte-for-byte unchanged**:
- **domain:** `tier.ts` — **pure** `selectTier(mastery)` realizing the `SM-1` table (`Recognized→cued`,
  `Productive`/`Fluent→free`; `Seen`/`New` throw — on-ramp tiers deferred, PRAG-1). Reuses the
  existing `ReviewTier` type; it is a **pure function, not a port** (no I/O — ARCH-2/COMP-3).
- **application:** `runReviewPass.ts` — loads the card once to read mastery, routes via `selectTier`,
  dispatches to `submitCuedReview` or `submitFreeProduction`, returns a `{ tier, outcome }`
  discriminated union. Deps `RunReviewPassDeps = SubmitFreeProductionDeps` (the judged set is a
  structural superset of the cued one, so one dependency object forwards to both).
- **infrastructure:** `composeReviewPass(judge, itemsPath?)` in `composition.ts` (delegates to
  `composeFreeProduction`); `reviewPass.smoke.test.ts` drives the real catalog + wink + ts-fsrs + fake
  judge through a `Recognized→cued` pass (zero judge calls) and a `Productive→free` pass.
- **Covers:** LOOP-1 (mastery selects tier), LOOP-2 (cued = no LLM), LOOP-3/INV-2 (bounce → no
  rating/schedule/log), LOOP-4 (pass rates Good / fail rates Again + demotes), LOOP-5 (rated branch
  persists one log, bounce none), SM-1, SM-6 (Fluent maintenance demotes `Fluent→Productive`).
  *(51 tests total at time of writing.)*

**Also implemented — the SM-5 Fluent promotion + counter slice** (`spec/01` SM-5 + `spec/10`; still
**no external services**). Completes the ladder's productive top end + the headline metric. SM-5 and the counter
share one primitive — *distinct calendar days bearing a passing free judged production* — derived
from the persisted `ReviewLog`s (no Card-field drift, INV-4 filters cued/recognition):
- **domain:** `judgedPassLedger.ts` (`distinctPassDays` w/ injectable UTC-offset day boundary +
  `mostRecentPassScaffolded`), `fluentGate.ts` (`qualifiesForFluent` = SM-5's four-condition
  conjunction), `mastery.ts` `promoteOnJudgedPass` (Productive→Fluent iff gate; Fluent stays Fluent),
  `counter.ts` `isCounted` (CNT-2/3/6), four new `constants.ts` (`FLUENT_JUDGED_PASSES`=3,
  `FLUENT_MIN_STABILITY_DAYS`=21, `COUNTER_MIN_SPACED_PASSES`=2, `COUNTER_R_FLOOR`=0.70).
- **application:** `Scheduler.getRetrievability` + `CardRepository.logsForWord`/`listCards` ports;
  `submitFreeProduction` passing branch promotes from the ledger (fail/bounce + single-save
  unchanged); new `readUsableCounter.ts` read-model (live retrievability gate at read time).
- **infrastructure:** ts-fsrs `get_retrievability` behind the port, in-memory query impls,
  `composeUsableCounter`, `fluentCounter.smoke.test.ts` (real wink + ts-fsrs + fake judge:
  3-spaced-pass promotion + counter membership/decay).
- **Covers:** SM-5 (a/b/c/d), SM-6/7, SM-9, INV-4, CNT-2/3/4/6. *(81 tests total at time of writing.)*

**Also implemented — the real DeepSeek cloud-judge + failure-path slice** (`spec/06` JDG-10/11/6/4 +
`spec/08` NET-*; started 2026-07-01). The **first slice that touches an external service** — it swaps
`FakeJudge` for a real DeepSeek V4 Flash HTTPS adapter behind the *unchanged* `JudgePort`, closing the
**cloud-failure half of INV-2** (only the rule-layer half was proven before). **`runReviewPass` needed
no code change** — the widened result union threads through its types. The **test suite stays fully
offline** (the adapter is tested via an injected fake `http`; smoke tests keep `FakeJudge`; `liveJudge`
is never constructed in tests):
- **application:** `ports/judge.ts` gains `JudgeUnavailableError` + `JudgeUnavailableReason`
  (`transient`/`rate_limited`/`offline`/`invalid_response`) — thrown by infra, caught by the use-case
  (dependency points inward, ARCH-1); the `judge()` signature is unchanged (a verdict stays its only
  success shape — SOLID-3). `submitFreeProduction` gains a third `UnavailableResult` arm
  (`bounce | judged | unavailable`): a transport failure derives **no** rating/scheduler/log and leaves
  the card due (INV-2/RAT-2) — it is **not** a bounce. `constants.ts` `CLOUD_RETRY_COUNT`=1 (NET-3).
- **infrastructure:** `deepSeekJudge.ts` (`DeepSeekJudge`; injectable `http` seam defaulting to `fetch`;
  JDG-6 JSON mode — *not* GBNF; the single backed-off retry lives here, NET-3/6; error classification
  NET-3/4/5; **never fabricates a gate** — a 2xx body missing a gate boolean throws `invalid_response`,
  JDG-3/INV-2; other-4xx like 401 fails loud as a plain `Error`), `deepSeekConfig.ts`
  (`deepSeekConfigFromEnv`, the **only** place `DEEPSEEK_API_KEY` is read — server-side, NET-7),
  `deepSeekRubric.ts` (system prompt + 2 few-shots + `RUBRIC_VERSION`, the JDG-9/11 cache/version
  lever), `liveJudge()`/`composeReviewPassLive()` in `composition.ts` (kept out of default wirings so
  tests need no key/network).
- **Covers:** INV-2 (cloud-failure half — no rating/scheduler/log, card stays due), NET-3/4/5/6/7,
  JDG-4/6/10/11, JDG-2/5 (parse maps to the pure `passesGate`, unchanged). *(95 tests total at time of
  writing.)*
- **Deferred within this slice (need UI, PRAG-1):** NET-2 "checking…" affordance and the NET-5
  *pre-submit* offline block are presentation; the `unavailable` result carries the reason for a future
  UI. The optional key-gated manual smoke script is not built.

**Also implemented — the pure edit-resolution slice** (`spec/07` EDIT-*; still **no external
services** — a pure domain algorithm, no infra/wiring). Completes the post-judge data path: it turns
the judge's `verdict.replacements` (find/replace pairs) into character spans a future UI renders. It
has **no consumer yet** (the consumer is the deferred presentation layer, PRAG-1) — only the pure
function + tests were added:
- **domain:** `editResolution.ts` — pure `resolveEdits(rawSentence, replacements, correctedSentence)`
  returning a `{ kind: "inline"; edits } | { kind: "fallback"; correctedSentence }` union. Reuses the
  existing `Replacement` from `verdict.ts` (no edit there). In-module `REASON_PRIORITY` (fixed domain
  rule `sense > grammar > collocation > register`, **not** a `constants.ts` tunable, cf. `CONTENT_POS`
  in `ruleLayer.ts`).
- **Design decision (confirmed with user):** `EDIT-4` fallback is **binary** — **any** edit whose
  `find` has 0 or ≥2 matches (empty `find` counts as unresolvable) suppresses *all* inline rendering
  and returns the whole-sentence `corrected_sentence`. Empty `replacements` is a clean inline result,
  not a fallback.
- **Covers:** EDIT-3 (unique-substring span), EDIT-4 (0/≥2 → whole-sentence fallback, never guesses a
  position), EDIT-5 (right-to-left / descending-`start` output), EDIT-6 (overlap dedup by reason
  priority), EDIT-2 (takes no gate input, returns none — resolution never adjudicates). EDIT-1 is a
  judge-contract constraint already met by the `Replacement` shape (cited, no code). *(103 tests total
  at time of writing.)*
- **Deferred within this slice (need UI, PRAG-1):** EDIT-7 inline render (strikethrough/insertion,
  color-by-`reason`, on-demand `one_line_feedback`) and the optional wink token-boundary snapping —
  the `ResolvedEdit[]` this slice returns is exactly that render's input.

**Also implemented — the first persistence slice** (`spec/12` DM-5..DM-7, STACK-3/6; started
2026-07-01). The **first slice with a real database.** It swaps `InMemoryCardRepository` for a
Drizzle-backed adapter behind the *unchanged* `CardRepository` port — **no use-case or domain module
changed** (the swap is confined to the composition root, ARCH-3). The **test suite stays fully
offline**: the adapter is tested against an embedded in-process Postgres (**pglite**), never Neon or
the network:
- **infrastructure:** `db/schema.ts` (Drizzle schema — `cards` composite PK `(userId, senseId)` +
  append-only `review_logs` with a `serial seq` for order; `mastery` is its **own column**, persisted
  separately from FSRS state — DM-7/INV-3; FSRS fields are **expanded `fsrs_`-prefixed columns** with
  `timestamptz` so `Date`s round-trip losslessly — no jsonb Date footgun), `drizzleCardRepository.ts`
  (`DrizzleCardRepository` over a **dialect-agnostic** `DrizzleDb` handle so the *same* code runs on
  pglite and Neon; pure row⇄domain mappers; `save` is an upsert = lazy-create + update, SM-2),
  `db/pglite.ts` + `db/neon.ts` (the two `db` factories; `neonDbFromEnv` reads `DATABASE_URL`
  server-side only, the NET-7/STACK-4 secret-boundary pattern — kept out of default wirings),
  `composeReviewPassPersistent(judge, db, itemsPath?)` in `composition.ts` (reuses
  `composeFreeProduction`, swaps only the repo).
- **shared contract test:** `cardRepositoryContract.ts` — one conformance suite run against **both**
  the in-memory and Drizzle repos, so their Liskov substitutability (SOLID-3) is build-enforced, not
  asserted by hand. Drizzle runs it on a fresh migrated pglite DB per test.
- **tooling:** `drizzle.config.ts` + generated `drizzle/0000_init.sql` (committed; the *same*
  migrations apply to pglite in tests and Neon in prod — no hand-written DDL, no drift);
  `npm run db:generate` / `db:migrate` scripts.
- **Covers:** DM-5 (card persisted per user, dates round-trip), DM-6 (ReviewLog append-only from
  review #1, append order preserved via `seq`), DM-7 (mastery persisted separately from FSRS state),
  SM-2 (upsert = one card per word), INV-4 (`logsForWord` filters by user+word), multi-tenant
  scoping. *(121 tests total at time of writing.)*
- **Deferred within this slice (PRAG-1):** memo-row table (DM-8, MEMO-1 is a MAY, no consumer);
  BetterAuth / real `userId` provisioning (STACK-4 — the adapter takes `userId` as a plain string);
  live Neon migration/CI wiring beyond the `makeNeonDb` factory. **Note the pglite suite adds ~12s**
  (a fresh migrated DB per test); share-one-DB-with-truncation is the optimization if it drags.

**Also implemented — the `Seen` on-ramp tiers slice** (`spec/03` TIER-1/2/5 + `spec/01` SM-3 +
`spec/02` RAT-7; started 2026-07-01). This is the **missing rung** between introduction and the
existing loop: it makes the ladder continuous by wiring the two `Seen` on-ramp tiers the loop
previously threw on. Still **no external services** — both tiers are deterministic (recognition = exact
match, cloze = the same lemma-match as cued), mirroring the cued slice; **no use-case above was changed
in behavior** (`submitCuedReview` was refactored onto a shared core with its public API byte-identical):
- **domain:** `onRampLedger.ts` (`nextSeenTier` — the recognition-vs-cloze position is **derived from
  the persisted `ReviewLog`s**, not a new Card field, mirroring `judgedPassLedger`'s no-drift
  convention; a pure fold encoding SM-3's two-step + RAT-7's capped drop-back via a sticky
  `dropbackUsed` flag); `isRecognitionCorrect` in `grading.ts` (TIER-2 **exact identity**, not
  lemma-match — the MCQ is pick-the-word); `promoteOnClozePass` in `mastery.ts` (SM-3 `Seen→Recognized`
  on a cloze pass; an MCQ pass alone never promotes); `ReviewTier` widened to
  `recognition | cloze | cued | free` (INV-4 preserved — the ledger/counter still filter `tier==="free"`);
  two constants (`RECOGNITION_MCQ_OPTIONS`=4, `SEEN_CLOZE_DROPBACK_CAP`=1).
- **application:** `submitDeterministicReview.ts` — the **shared grade→rate→schedule→promote→log core**
  extracted once the third deterministic tier appeared (rule-of-three, PRAG-3), strategy-injected by
  `{ tier, grade, promote }` (SOLID-2 — new tiers are config, not core edits). `submitCuedReview` was
  refactored onto it; thin `submitCloze` + `submitRecognition` are new configs. `runReviewPass` routes
  `Seen` via `nextSeenTier` **before** `selectTier` (which was narrowed to return `cued | free`, since
  `Seen` is routed upstream and `New` throws — `New→Seen` intro is seeding). The `RunReviewPassResult`
  union gained `recognition`/`cloze` arms; `RunReviewPassDeps` is **unchanged** (the deterministic tiers
  need only a subset of the existing superset).
- **infrastructure:** **no new adapters** (composition wirings unchanged). `onRamp.smoke.test.ts` drives
  a real `items.json` word `Seen → Recognized → Productive` through real wink + ts-fsrs with the
  FakeJudge recording **zero calls** — the acceptance proof that the loop no longer dead-ends on `Seen`.
- **Key insight — the RAT-7 drop-back is pure *routing*** (which tier to show next), never a mastery
  change, so nothing about it lives in the use-cases; it is entirely in `nextSeenTier`.
- **Covers:** TIER-1/2/5, SM-3 (spaced two-step, promotion on the cloze pass), RAT-7 (first cloze fail →
  one MCQ drop-back, capped, no ping-pong), SM-6 (deterministic fails never demote), RAT-1/8 + DM-6,
  INV-1/INV-3. *(143 tests total at time of writing.)*
- **Deferred within this slice (PRAG-1):** MCQ option assembly/shuffle + rendering (presentation, like
  EDIT-7); the `New→Seen` introduction that *creates* `Seen` cards (seeding, `09`).

**Also implemented — the first-session seeding + placement slice** (`spec/09`; still **no external
services** — real JSON catalog + ts-fsrs + in-memory repo). This is the piece that *creates* a user's
cards, so the now-continuous ladder finally has an on-ramp: a seeded card is reviewable end-to-end.
The three placement mechanisms (SEED-2/3) stay **structurally separate** — they are three distinct
inputs (frontier band, per-word marks, list-stack word source), so the LexTALE scalar can never mark
or select words (enforced by the type surface). The existing use-cases are **byte-for-byte unchanged**:
- **domain (pure):** `entryState.ts` (`introductionState` — placement-known → `Recognized`, else
  `Seen`, SM-11/SEED-3; flag-only, band deliberately not a param), `introductionPacing.ts`
  (`newIntroductionsAllowed` — SEED-6/9 first-session/steady-state/under-backlog cap; the backlog cap
  is the closed-form `floor(f/(1−f)·due)` so `new/(new+due) ≤ f` "of the session", needing only the
  due count), `coldStart.ts` (`coldStartDifficulty(cefr, band)` — SEED-8 CEFR×band estimate in FSRS
  [1,10]), four `constants.ts` (`FIRST_SESSION_SEED_WORDS`=2, `NEW_PER_DAY`=5,
  `NEW_FRACTION_UNDER_BACKLOG`=0.30, `REQUEST_RETENTION`=0.90).
- **application:** new narrow `WordSource` port (`nextFrontierWords(band, exclude, count)` — selection
  only, SOLID-4); `Scheduler.newCard` widened with an optional `ColdStart` seed; use-case
  `seedIntroductions.ts` (pacing → list-stack select excluding already-carded → lazy `newCard`
  cold-started → entry state → save; reuses `CardRepository.listCards`/`save`, **no new repo method**).
- **infrastructure:** `jsonWordSource.ts` (band bucket, list_rank order, `sense_id` tiebreak),
  `tsFsrsScheduler` now configures `request_retention` + applies the cold-start difficulty (with a
  note that ts-fsrs recomputes D/S on the first graded review), `composeSeeding` in `composition.ts`,
  `seeding.smoke.test.ts` (real catalog + ts-fsrs: first-session seed, SM-11 skip, and a placement-
  known `Recognized` card reviewed through `runReviewPass` to `Productive`).
- **Covers:** SEED-1/2/3/5/6/7/8/9, SM-11, INV-3. *(163 tests total at time of writing.)*
- **Deferred within this slice (PRAG-1):** the LexTALE instrument internals (SEED-4 — the scalar is
  modeled as an input band); per-user FSRS optimization above `PER_USER_OPT_REVIEW_THRESHOLD` reviews
  (SEED-8, needs `@open-spaced-repetition/binding`); the live session-queue that interleaves new intros
  with due reviews + the "tune your level" UI (presentation/session-orchestration — this slice ships
  the pure pacing *policy* + card creation, not a running queue).

**Also implemented — the session-queue / due-word surfacing slice** (`spec/11` LOOP-1 step 1; still
**no external services** — real JSON catalog + ts-fsrs + in-memory repo). Closes the loop's last
backend gap: `runReviewPass` previously took `senseId` as given (surfacing was out of scope). This
slice decides *what* to review and interleaves paced new intros with due reviews. **No new ports, no
adapter changes, no existing use-case/domain module changed** — additive:
- **domain (pure):** `sessionQueue.ts` (`orderSessionQueue(cards, introSenseIds, now)` — due filter
  (`fsrs.due <= now`), reviews ordered most-overdue-first (`senseId` tiebreak), fresh intros **evenly
  interleaved** among reviews via a proportional even-merge, SEED-6). The fresh-intro set is passed
  explicitly (the seeder returns exactly what it created — no `reps`/mastery heuristic, no INV-3 concern).
- **application:** `startSession.ts` — the single session-start entry point: `seedIntroductions` (paced,
  SEED-1/6/7) → `listCards` → `orderSessionQueue`, returning `{ queue, seeded }`. `StartSessionDeps =
  SeedIntroductionsDeps` (the ordering needs only `cards`, already in that set).
- **infrastructure:** `composeSession` in `composition.ts`; `session.smoke.test.ts` (real catalog +
  ts-fsrs: first-session seed → ordered queue → each queued word reviewed end-to-end via `runReviewPass`).
- **Covers:** LOOP-1 (step 1 surfacing + ordering), SEED-6 (interleave; pacing reused), SEED-7 (queue
  surfaces only already-created cards). *(180 tests total at time of writing.)*
- **Deferred within this slice (PRAG-1):** prompt resolution (what to render before a response — the
  presentation slice); per-day intro dedup (`seedIntroductions` paces per-invocation, not per calendar
  day — no day ledger yet); a due-only repo query (`listCards` + in-domain filter suffices for v1).

**Key design conventions established (follow them in later slices):**
- The **Lemmatizer port returns NLP forms; a pure domain rule decides the match** — keep wink out of
  the domain. `isLemmaMatch` now backs cued grading, cloze grading (both TIER-5) and the rule layer's
  presence check (RL-2); the degeneracy check (RL-3) uses a **separate** `SentenceAnalyzer` port (POS tags),
  not bolted onto `Lemmatizer` (SOLID-4). One wink adapter implements both.
- **Scheduling types** (`FsrsCardState`/`FsrsReviewLog`) are declared **structurally in the domain**;
  ts-fsrs's own `Card`/`ReviewLog` are mapped only inside `tsFsrsScheduler`. Don't leak ts-fsrs (or
  any library) into application/domain — put it behind a port (`ARCH-3`).
- Every test names the `spec/` ID it exercises.

**Deferred (do NOT build until pulled into scope — `PRAG-1`):** verdict memo (`05`, `MEMO-1` is a
`MAY`); the failure path's UI affordances (NET-2 "checking…" + NET-5 pre-submit offline block, need
UI); the counter's daily goal / inline-edit feedback (`CNT-7/8/9`, need UI); the LexTALE instrument +
per-user FSRS optimization (the two SEED-4/8 bits carved out of the seeding slice); BetterAuth
(STACK-4) adapter; presentation/UI (React + TanStack + shadcn, STACK-7/2/5). *(The **real DeepSeek judge
(`JDG-10/11`) + failure path (`08`)**, the **pure edit-resolution algorithm (`07` EDIT-2..6)**, the
**first persistence slice (`12`, Neon + Drizzle behind `CardRepository`, STACK-3/6)**, the **`Seen`
on-ramp tiers (`03` + SM-3 + RAT-7)**, and now **first-session seeding (`09`)** are implemented — see
the slices above; EDIT-7's inline render and the recognition-MCQ option assembly/shuffle are the
remaining presentation-only bits.)*
**Natural next slice:** the **React presentation** over `runReviewPass` + `seedIntroductions` + the
counter — the only greenfield layer left, and where the deferred UI bits land (EDIT-7's `resolveEdits`
render, the recognition-MCQ option assembly/shuffle, NET-2/5 affordances, CNT-7/8/9, the seeding
"tune your level" step + live session queue). The backend machine is now continuous **New→Fluent**:
seeding creates cards, the on-ramp walks `Seen`, the cued/judged tiers climb, the counter reads out.

> **Status (2026-07-02):** the entire runtime stack is now merged to **`master`** as one linear
> history (real judge + `08` → edit-resolution `07` → persistence `12` → `Seen` on-ramp `03` →
> seeding `09`, topped by the rubric-tuning commit); the per-slice `runtime-*` branches were deleted
> post-merge, so **`master` is again the only branch**. Re-confirm with `git log` and re-run `npm test`
> (163 at time of writing) at session start — do not trust this count if the tree has moved on.

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
