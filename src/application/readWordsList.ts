import { distinctPassDays } from "../domain/judgedPassLedger.js";
import { isCounted } from "../domain/counter.js";
import { COUNTER_R_FLOOR } from "../domain/constants.js";
import type { MasteryState } from "../domain/card.js";
import type { CardRepository } from "./ports/cardRepository.js";
import type { Scheduler } from "./ports/scheduler.js";
import type { Catalog } from "./ports/catalog.js";

export interface ReadWordsListInput {
  userId: string;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
  /** CNT-2 day boundary; per-user tz is seeding-deferred, so default UTC (0). */
  utcOffsetMinutes?: number;
}

export interface ReadWordsListDeps {
  cards: CardRepository;
  scheduler: Scheduler;
  catalog: Catalog;
}

/** One row of the learner's word list (`/words`). */
export interface WordSummary {
  senseId: string;
  lemma: string;
  mastery: MasteryState;
  /** Live retrievability at read time (CNT-3), in [0,1]. */
  retrievability: number;
  /** CNT-3: whether `retrievability` is at or above COUNTER_R_FLOOR (drives the meter colour). */
  aboveFloor: boolean;
  /** CNT-2: counted in "words you can now use" (≥2 spaced judged passes AND R ≥ floor). */
  counted: boolean;
  /** CNT-2: distinct calendar days with a passing free judged production. */
  judgedPassDays: number;
}

export interface ReadWordsListResult {
  words: WordSummary[];
}

/**
 * The word-list read-model (spec/10 CNT-2/3). A pure read over the user's cards + persisted ReviewLogs:
 * per card it reduces the logs to a spaced-judged-pass count (judgedPassLedger — INV-4 drops the
 * deterministic tiers), reads live retrievability (CNT-3, at read time so the meter is honest between
 * reviews), and joins the catalog for the display lemma. It never writes, rates, or schedules.
 *
 * `New`/mastery filtering is left to the presentation layer (the list keeps its client-side filter UI);
 * this returns every carded word so the surface can filter without a round-trip.
 */
export async function readWordsList(
  input: ReadWordsListInput,
  deps: ReadWordsListDeps,
): Promise<ReadWordsListResult> {
  const now = input.now ?? new Date();
  const offset = input.utcOffsetMinutes ?? 0;

  const cards = await deps.cards.listCards(input.userId);
  const words: WordSummary[] = [];
  for (const card of cards) {
    const logs = await deps.cards.logsForWord(card.userId, card.senseId);
    const passDays = distinctPassDays(logs, offset);
    const retrievability = deps.scheduler.getRetrievability(card.fsrs, now);
    const item = deps.catalog.get(card.senseId);
    if (item === undefined) {
      throw new Error(`readWordsList: no catalog item for sense ${card.senseId}`);
    }
    words.push({
      senseId: card.senseId,
      lemma: item.lemma,
      mastery: card.mastery,
      retrievability,
      aboveFloor: retrievability >= COUNTER_R_FLOOR,
      counted: isCounted({ passDays, retrievability }),
      judgedPassDays: passDays,
    });
  }
  return { words };
}
