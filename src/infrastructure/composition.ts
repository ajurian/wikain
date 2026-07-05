/**
 * Composition root (ARCH-3): the single place that wires concrete adapters to the application's ports.
 * Persistence is Drizzle-only — the composers take the concrete stores (`cards`/`memo`/`marks`/
 * `settings`) as arguments; the caller constructs them over a `DrizzleDb` handle (Neon in prod, pglite
 * in tests). There is no in-memory adapter and no offline fallback (removed with STACK-4): the app
 * requires a real database, tests run against embedded pglite.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SubmitCuedReviewDeps } from "../application/submitCuedReview.js";
import type { SubmitFreeProductionDeps } from "../application/submitFreeProduction.js";
import type { RunReviewPassDeps } from "../application/runReviewPass.js";
import type { ReadUsableCounterDeps } from "../application/readUsableCounter.js";
import type { ReadDashboardSummaryDeps } from "../application/readDashboardSummary.js";
import type { ReadWordsListDeps } from "../application/readWordsList.js";
import type { ReadWordDetailDeps } from "../application/readWordDetail.js";
import type { SeedIntroductionsDeps } from "../application/seedIntroductions.js";
import type { StartSessionDeps } from "../application/startSession.js";
import type { ResolveReviewPromptDeps } from "../application/resolveReviewPrompt.js";
import type { ReadPlacementSlateDeps } from "../application/readPlacementSlate.js";
import type { RecordPlacementMarksDeps } from "../application/recordPlacementMarks.js";
import type { JudgePort } from "../application/ports/judge.js";
import type { CardRepository } from "../application/ports/cardRepository.js";
import type { Scheduler } from "../application/ports/scheduler.js";
import type { PlacementMarksStore } from "../application/ports/placementMarks.js";
import type { SettingsStore } from "../application/ports/settings.js";
import type { MemoVersions, VerdictMemoPort } from "../application/ports/verdictMemo.js";
import { JsonCatalog } from "./catalog.js";
import { JsonWordSource } from "./jsonWordSource.js";
import { TsFsrsScheduler } from "./tsFsrsScheduler.js";
import { WinkLemmatizer } from "./winkLemmatizer.js";
import { TAGALOG_LEXICON } from "./tagalogLexicon.js";
import { DeepSeekJudge } from "./deepSeekJudge.js";
import { deepSeekConfigFromEnv } from "./deepSeekConfig.js";
import { RUBRIC_VERSION } from "./deepSeekRubric.js";

/**
 * spec/05 MEMO-6: a fixed memo version stamp for wirings that use a FAKE judge (tests). A memo hit must
 * match the (model, rubric) pair; the fake judge carries a fixed `"fake"` model id + the real
 * RUBRIC_VERSION so a rubric bump still invalidates. The live wiring stamps the real DeepSeek model id
 * instead (`liveJudgeVersions`).
 */
export const DEV_JUDGE_VERSIONS: MemoVersions = {
  modelVersion: "fake",
  rubricVersion: RUBRIC_VERSION,
};

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** repo/build/out/items.json, resolved from src/infrastructure/. */
export const ITEMS_PATH = path.resolve(HERE, "..", "..", "build", "out", "items.json");

export function composeCuedReview(
  cards: CardRepository,
  itemsPath: string = ITEMS_PATH,
): SubmitCuedReviewDeps {
  return {
    catalog: JsonCatalog.fromFile(itemsPath),
    cards,
    scheduler: new TsFsrsScheduler(),
    lemmatizer: new WinkLemmatizer(),
  };
}

/**
 * Wiring for the judged free-production slice. The `judge`, `cards`, and `memo` are injected; the one
 * wink adapter serves as both Lemmatizer (presence) and SentenceAnalyzer (degeneracy POS).
 */
export function composeFreeProduction(
  judge: JudgePort,
  cards: CardRepository,
  memo: VerdictMemoPort,
  judgeVersions: MemoVersions,
  itemsPath: string = ITEMS_PATH,
): SubmitFreeProductionDeps {
  const wink = new WinkLemmatizer();
  return {
    catalog: JsonCatalog.fromFile(itemsPath),
    cards,
    scheduler: new TsFsrsScheduler(),
    lemmatizer: wink,
    analyzer: wink,
    judge,
    tagalogLexicon: TAGALOG_LEXICON,
    memo,
    judgeVersions,
  };
}

/**
 * Wiring for the end-to-end loop (spec/11). `runReviewPass` routes cued vs. judged, so it needs the full
 * judged-branch dependency set (a structural superset of the cued one).
 */
export function composeReviewPass(
  judge: JudgePort,
  cards: CardRepository,
  memo: VerdictMemoPort,
  judgeVersions: MemoVersions,
  itemsPath: string = ITEMS_PATH,
): RunReviewPassDeps {
  return composeFreeProduction(judge, cards, memo, judgeVersions, itemsPath);
}

/**
 * The live judge (spec/06 JDG-10, spec/08 NET-7): a DeepSeek adapter configured from the environment.
 * The single place the API key is read — server-side (NET-7). Kept out of test wirings (tests inject a
 * FakeJudge) so the suite never needs a key or the network.
 */
export function liveJudge(): JudgePort {
  return new DeepSeekJudge(deepSeekConfigFromEnv());
}

/**
 * spec/05 MEMO-6: the live judge's version stamp — the real DeepSeek model id (from config) +
 * RUBRIC_VERSION. Reads the config (server-side, NET-7); requires `DEEPSEEK_API_KEY`.
 */
export function liveJudgeVersions(): MemoVersions {
  return { modelVersion: deepSeekConfigFromEnv().model, rubricVersion: RUBRIC_VERSION };
}

/**
 * Wiring for first-session seeding (spec/09). Creates a user's cards (New → Seen, or → Recognized for
 * placement-known words, SM-11) from the frequency-list stack. The shared `cards` + `marks` stores are
 * injected so seeded cards are visible to the review pass and a marked word enters at Recognized (SEED-7).
 */
export function composeSeeding(
  cards: CardRepository,
  marks: PlacementMarksStore,
  itemsPath: string = ITEMS_PATH,
): SeedIntroductionsDeps {
  return {
    catalog: JsonCatalog.fromFile(itemsPath),
    wordSource: JsonWordSource.fromFile(itemsPath),
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
  itemsPath: string = ITEMS_PATH,
): StartSessionDeps {
  return composeSeeding(cards, marks, itemsPath);
}

/**
 * Wiring for the onboarding placement-marking step (spec/09 SEED-2). The slate read reuses the same
 * list-stack word source + catalog the seeder selects from.
 */
export function composePlacementSlate(
  cards: CardRepository,
  itemsPath: string = ITEMS_PATH,
): ReadPlacementSlateDeps {
  return {
    wordSource: JsonWordSource.fromFile(itemsPath),
    cards,
    catalog: JsonCatalog.fromFile(itemsPath),
  };
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
  itemsPath: string = ITEMS_PATH,
): ResolveReviewPromptDeps {
  return { catalog: JsonCatalog.fromFile(itemsPath), cards };
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
  scheduler: Scheduler = new TsFsrsScheduler(),
  itemsPath: string = ITEMS_PATH,
): ReadWordsListDeps & ReadWordDetailDeps {
  return { cards, scheduler, catalog: JsonCatalog.fromFile(itemsPath) };
}
