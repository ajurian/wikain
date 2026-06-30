/**
 * Composition root for the cued-review slice (ARCH-3): the single place that wires concrete
 * adapters to the application's ports. Swapping the in-memory repository for the Neon adapter
 * (STACK-3) later happens only here.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SubmitCuedReviewDeps } from "../application/submitCuedReview.js";
import { JsonCatalog } from "./catalog.js";
import { InMemoryCardRepository } from "./inMemoryCardRepository.js";
import { TsFsrsScheduler } from "./tsFsrsScheduler.js";
import { WinkLemmatizer } from "./winkLemmatizer.js";

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
