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
import type { JudgePort } from "../application/ports/judge.js";
import type { CardRepository } from "../application/ports/cardRepository.js";
import type { Scheduler } from "../application/ports/scheduler.js";
import { JsonCatalog } from "./catalog.js";
import { InMemoryCardRepository } from "./inMemoryCardRepository.js";
import { TsFsrsScheduler } from "./tsFsrsScheduler.js";
import { WinkLemmatizer } from "./winkLemmatizer.js";
import { TAGALOG_LEXICON } from "./tagalogLexicon.js";

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
