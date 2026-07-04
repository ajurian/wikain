/**
 * Composition root for the cued-review slice (ARCH-3): the single place that wires concrete
 * adapters to the application's ports. Swapping the in-memory repository for the Neon adapter
 * (STACK-3) later happens only here.
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
import type { JudgePort } from "../application/ports/judge.js";
import type { CardRepository } from "../application/ports/cardRepository.js";
import type { Scheduler } from "../application/ports/scheduler.js";
import { JsonCatalog } from "./catalog.js";
import { JsonWordSource } from "./jsonWordSource.js";
import { InMemoryCardRepository } from "./inMemoryCardRepository.js";
import { TsFsrsScheduler } from "./tsFsrsScheduler.js";
import { WinkLemmatizer } from "./winkLemmatizer.js";
import { TAGALOG_LEXICON } from "./tagalogLexicon.js";
import { DeepSeekJudge } from "./deepSeekJudge.js";
import { deepSeekConfigFromEnv } from "./deepSeekConfig.js";
import { DrizzleCardRepository, type DrizzleDb } from "./drizzleCardRepository.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** repo/build/out/items.json, resolved from src/infrastructure/. */
export const ITEMS_PATH = path.resolve(HERE, "..", "..", "build", "out", "items.json");

export function composeCuedReview(itemsPath: string = ITEMS_PATH): SubmitCuedReviewDeps {
  return {
    catalog: JsonCatalog.fromFile(itemsPath),
    cards: new InMemoryCardRepository(),
    scheduler: new TsFsrsScheduler(),
    lemmatizer: new WinkLemmatizer(),
  };
}

/**
 * Wiring for the judged free-production slice. The `judge` is injected because v1 has no real judge
 * adapter yet (the DeepSeek transport + failure path is the `08` slice) — pass a FakeJudge here. The
 * one wink adapter serves as both Lemmatizer (presence) and SentenceAnalyzer (degeneracy POS).
 */
export function composeFreeProduction(
  judge: JudgePort,
  itemsPath: string = ITEMS_PATH,
): SubmitFreeProductionDeps {
  const wink = new WinkLemmatizer();
  return {
    catalog: JsonCatalog.fromFile(itemsPath),
    cards: new InMemoryCardRepository(),
    scheduler: new TsFsrsScheduler(),
    lemmatizer: wink,
    analyzer: wink,
    judge,
    tagalogLexicon: TAGALOG_LEXICON,
  };
}

/**
 * Wiring for the end-to-end loop (spec/11). `runReviewPass` selects the tier from mastery state and
 * dispatches to the cued or judged use-case, so it needs the full judged-branch dependency set (a
 * structural superset of the cued one). The `judge` is injected — pass a FakeJudge until the real
 * DeepSeek adapter (`06`/`08`) lands.
 */
export function composeReviewPass(
  judge: JudgePort,
  itemsPath: string = ITEMS_PATH,
): RunReviewPassDeps {
  return composeFreeProduction(judge, itemsPath);
}

/**
 * Wiring for the end-to-end loop against a REAL database (spec/12 DM-5..DM-7, STACK-3/6). Swaps only
 * the `CardRepository` for the Drizzle adapter over the supplied `db` handle — everything else reuses
 * `composeFreeProduction`, so this is the single place persistence enters (ARCH-3). The `db` is
 * injected (pass `makeNeonDb(...)` for prod, `makePgliteDb()` for an offline run) so this function
 * itself needs no network or credentials. `judge` is injected exactly as in the in-memory wirings.
 */
export function composeReviewPassPersistent(
  judge: JudgePort,
  db: DrizzleDb,
  itemsPath: string = ITEMS_PATH,
): RunReviewPassDeps {
  return { ...composeFreeProduction(judge, itemsPath), cards: new DrizzleCardRepository(db) };
}

/**
 * The live judge (spec/06 JDG-10, spec/08 NET-7): a DeepSeek adapter configured from the environment.
 * This is the single place the API key is read — it stays server-side (NET-7). Kept out of the default
 * `compose*` wirings so the test suite never constructs it (and never needs a key or the network); it
 * is only invoked by a real entry point / the manual smoke script.
 */
export function liveJudge(): JudgePort {
  return new DeepSeekJudge(deepSeekConfigFromEnv());
}

/** Wiring for the end-to-end loop against the real DeepSeek judge (NET-7). Requires `DEEPSEEK_API_KEY`. */
export function composeReviewPassLive(itemsPath: string = ITEMS_PATH): RunReviewPassDeps {
  return composeReviewPass(liveJudge(), itemsPath);
}

/**
 * Wiring for first-session seeding (spec/09). Creates a user's cards (New → Seen, or → Recognized for
 * placement-known words, SM-11) from the frequency list stack. No external services (JSON catalog +
 * word source + ts-fsrs + in-memory repo). Pass the SHARED repository so seeded cards are visible to
 * the review pass; the default constructs a standalone in-memory repo for tests.
 */
export function composeSeeding(
  cards: CardRepository = new InMemoryCardRepository(),
  itemsPath: string = ITEMS_PATH,
): SeedIntroductionsDeps {
  return {
    catalog: JsonCatalog.fromFile(itemsPath),
    wordSource: JsonWordSource.fromFile(itemsPath),
    cards,
    scheduler: new TsFsrsScheduler(),
  };
}

/**
 * Wiring for a session start (spec/11 LOOP-1 step 1). `StartSessionDeps === SeedIntroductionsDeps`
 * (the queue ordering needs only `cards`, already in the seeding set), so this reuses the seeding
 * wiring — named separately for intent + a stable call site. Pass the SHARED repository so the queued
 * cards are the same ones the review pass reads/writes; the default constructs a standalone repo.
 */
export function composeSession(
  cards: CardRepository = new InMemoryCardRepository(),
  itemsPath: string = ITEMS_PATH,
): StartSessionDeps {
  return composeSeeding(cards, itemsPath);
}

/**
 * Wiring for the render-time prompt read-model (spec/03 TIER-*, spec/11 LOOP-1 step 2). Catalog + the
 * SHARED card repository — it reads the same store the review pass writes, so pass the shared repo.
 */
export function composeResolvePrompt(
  cards: CardRepository = new InMemoryCardRepository(),
  itemsPath: string = ITEMS_PATH,
): ResolveReviewPromptDeps {
  return { catalog: JsonCatalog.fromFile(itemsPath), cards };
}

/**
 * Wiring for the "words you can now use" counter read-model (spec/10). It reads the same per-user
 * card + ReviewLog store the review pass writes, so callers pass the SHARED repository (and scheduler
 * for live retrievability) — defaults construct standalone instances for tests.
 */
export function composeUsableCounter(
  cards: CardRepository = new InMemoryCardRepository(),
  scheduler: Scheduler = new TsFsrsScheduler(),
): ReadUsableCounterDeps {
  return { cards, scheduler };
}

/**
 * Wiring for the dashboard read-model (spec/01 SM-1, spec/10 CNT-8, SEED-6). A pure read over the same
 * per-user card + ReviewLog store the review pass writes, so callers pass the SHARED repository. Needs
 * only `cards` (no scheduler — unlike the counter, it reads no live retrievability); the default
 * constructs a standalone repo for tests.
 */
export function composeDashboardSummary(
  cards: CardRepository = new InMemoryCardRepository(),
): ReadDashboardSummaryDeps {
  return { cards };
}

/**
 * Wiring for the per-word read-models (spec/10 CNT-1/2/3, `/words` + `/words/$wordId`). Both
 * `readWordsList` and `readWordDetail` share one deps shape (`cards` + `scheduler` for live
 * retrievability + `catalog` for the display lemma/gloss), so a single composer serves both. Reads the
 * same SHARED store the review pass writes; defaults construct standalone instances for tests.
 */
export function composeWords(
  cards: CardRepository = new InMemoryCardRepository(),
  scheduler: Scheduler = new TsFsrsScheduler(),
  itemsPath: string = ITEMS_PATH,
): ReadWordsListDeps & ReadWordDetailDeps {
  return { cards, scheduler, catalog: JsonCatalog.fromFile(itemsPath) };
}
