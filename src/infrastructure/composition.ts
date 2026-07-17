/**
 * Composition root (ARCH-3): the single place that wires concrete adapters to the application's ports.
 * Persistence is Drizzle-only — the composers take the concrete stores (`cards`/`memo`/`marks`/
 * `settings`) as arguments; the caller constructs them over a `DrizzleDb` handle (Neon in prod, pglite
 * in tests). There is no in-memory adapter and no offline fallback (removed with STACK-4): the app
 * requires a real database, tests run against embedded pglite.
 */
import type { SubmitCuedReviewDeps } from "~/application/review/submitCuedReview.js";
import type { SubmitFreeProductionDeps } from "~/application/review/submitFreeProduction.js";
import type { RunReviewPassDeps } from "~/application/review/runReviewPass.js";
import type { ReadUsableCounterDeps } from "~/application/progress/readUsableCounter.js";
import type { ReadDashboardSummaryDeps } from "~/application/progress/readDashboardSummary.js";
import type { ReadWordsListDeps } from "~/application/progress/readWordsList.js";
import type { ReadWordDetailDeps } from "~/application/progress/readWordDetail.js";
import type { SeedIntroductionsDeps } from "~/application/session/seedIntroductions.js";
import type { StartSessionDeps } from "~/application/session/startSession.js";
import type { ResolveReviewPromptDeps } from "~/application/review/resolveReviewPrompt.js";
import type { ReadPlacementSlateDeps } from "~/application/placement/readPlacementSlate.js";
import type { RecordPlacementMarksDeps } from "~/application/placement/recordPlacementMarks.js";
import type { JudgePort } from "~/application/ports/judge.js";
import type { CardRepository } from "~/application/ports/cardRepository.js";
import type { Scheduler } from "~/application/ports/scheduler.js";
import type { PlacementMarksStore } from "~/application/ports/placementMarks.js";
import type { SettingsStore } from "~/application/ports/settings.js";
import type { Catalog } from "~/application/ports/catalog.js";
import type { WordSource } from "~/application/ports/wordSource.js";
import type { MemoVersions, VerdictMemoPort } from "~/application/ports/verdictMemo.js";
import type { SentenceAnalyzer } from "~/application/ports/sentenceAnalyzer.js";
import type { HealQueuePort } from "~/application/ports/healQueue.js";
import { TsFsrsScheduler } from "./tsFsrsScheduler.js";
import { TAGALOG_LEXICON } from "./nlp/tagalogLexicon.js";

/**
 * spec/05 MEMO-6: a fixed memo version stamp for wirings that use a FAKE judge (tests). A memo hit must
 * match the (model, rubric) pair; the fake judge carries a fixed `"fake"` model id + a fixed rubric
 * stamp. The live wiring reads the REAL pair from the language service (`fetchJudgeVersions`) rather
 * than duplicating the rubric version here, where it could silently drift from the judge that used it.
 */
export const DEV_JUDGE_VERSIONS: MemoVersions = {
  modelVersion: "fake",
  rubricVersion: "test-rubric",
};

/**
 * The catalog + word source are now injected (DB-backed, hydrated once at the composition root) rather
 * than read from the filesystem per call — no `fs`/bundle-tracing on the serverless request path
 * (spec/12 DM-2; STACK-3). The composers thread the already-built `catalog`/`wordSource` singletons in.
 */
export function composeCuedReview(
  cards: CardRepository,
  catalog: Catalog,
  analyzer: SentenceAnalyzer,
): SubmitCuedReviewDeps {
  return {
    catalog,
    cards,
    scheduler: new TsFsrsScheduler(),
    analyzer,
  };
}

/**
 * Wiring for the judged free-production slice. The `judge`, `cards`, `memo` and `analyzer` are all
 * injected — the analyzer is now a service client (`HttpNlp`), so it is built once at the root and
 * shared, not constructed per call (its model-sentence cache would be useless otherwise).
 */
export function composeFreeProduction(
  judge: JudgePort,
  cards: CardRepository,
  memo: VerdictMemoPort,
  judgeVersions: MemoVersions,
  catalog: Catalog,
  analyzer: SentenceAnalyzer,
): SubmitFreeProductionDeps {
  return {
    catalog,
    cards,
    scheduler: new TsFsrsScheduler(),
    analyzer,
    judge,
    tagalogLexicon: TAGALOG_LEXICON,
    memo,
    judgeVersions,
  };
}

/**
 * Wiring for the end-to-end loop (spec/11). `runReviewPass` routes cued vs. judged, so it needs the full
 * judged-branch dependency set (a structural superset of the cued one) plus the cloze branch's
 * heal queue (FIT-11).
 */
export function composeReviewPass(
  judge: JudgePort,
  cards: CardRepository,
  memo: VerdictMemoPort,
  judgeVersions: MemoVersions,
  catalog: Catalog,
  analyzer: SentenceAnalyzer,
  healQueue: HealQueuePort,
): RunReviewPassDeps {
  return {
    ...composeFreeProduction(judge, cards, memo, judgeVersions, catalog, analyzer),
    healQueue,
  };
}

/**
 * Wiring for first-session seeding (spec/09). Creates a user's cards (New → Seen, or → Recognized for
 * placement-known words, SM-11) from the frequency-list stack. The shared `cards` + `marks` stores are
 * injected so seeded cards are visible to the review pass and a marked word enters at Recognized (SEED-7).
 */
export function composeSeeding(
  cards: CardRepository,
  marks: PlacementMarksStore,
  catalog: Catalog,
  wordSource: WordSource,
): SeedIntroductionsDeps {
  return {
    catalog,
    wordSource,
    cards,
    scheduler: new TsFsrsScheduler(),
    marks,
  };
}

/**
 * Wiring for a session start (spec/11 LOOP-1 step 1). `StartSessionDeps === SeedIntroductionsDeps`, so
 * this reuses the seeding wiring — named separately for intent + a stable call site.
 */
export function composeSession(
  cards: CardRepository,
  marks: PlacementMarksStore,
  catalog: Catalog,
  wordSource: WordSource,
): StartSessionDeps {
  return composeSeeding(cards, marks, catalog, wordSource);
}

/**
 * Wiring for the onboarding placement-marking step (spec/09 SEED-2). The slate read reuses the same
 * list-stack word source + catalog the seeder selects from.
 */
export function composePlacementSlate(
  cards: CardRepository,
  catalog: Catalog,
  wordSource: WordSource,
): ReadPlacementSlateDeps {
  return { wordSource, cards, catalog };
}

export function composeRecordPlacementMarks(
  marks: PlacementMarksStore,
): RecordPlacementMarksDeps {
  return { marks };
}

/**
 * Wiring for the render-time prompt read-model (spec/03 TIER-*, spec/11 LOOP-1 step 2). Catalog + the
 * shared card repository.
 */
export function composeResolvePrompt(
  cards: CardRepository,
  catalog: Catalog,
): ResolveReviewPromptDeps {
  return { catalog, cards };
}

/**
 * Wiring for the "words you can now use" counter read-model (spec/10). Reads the shared per-user card +
 * ReviewLog store; the scheduler gives live retrievability (CNT-3).
 */
export function composeUsableCounter(
  cards: CardRepository,
  scheduler: Scheduler = new TsFsrsScheduler(),
): ReadUsableCounterDeps {
  return { cards, scheduler };
}

/**
 * Wiring for the dashboard read-model (spec/01 SM-1, spec/10 CNT-8, SEED-6). Reads the shared card +
 * ReviewLog store; `settings` supplies the learner's daily goal (CNT-8).
 */
export function composeDashboardSummary(
  cards: CardRepository,
  settings: SettingsStore,
): ReadDashboardSummaryDeps {
  return { cards, settings };
}

/**
 * Wiring for the per-word read-models (spec/10 CNT-1/2/3, `/words` + `/words/$wordId`). Both share one
 * deps shape (`cards` + `scheduler` for live retrievability + `catalog`), so a single composer serves both.
 */
export function composeWords(
  cards: CardRepository,
  catalog: Catalog,
  scheduler: Scheduler = new TsFsrsScheduler(),
): ReadWordsListDeps & ReadWordDetailDeps {
  return { cards, scheduler, catalog };
}
