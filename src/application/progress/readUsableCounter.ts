import { distinctPassDays } from "../../domain/mastery/judgedPassLedger.js";
import { isCounted } from "../../domain/counter.js";
import type { CardRepository } from "../ports/cardRepository.js";
import type { Scheduler } from "../ports/scheduler.js";

export interface ReadUsableCounterInput {
  userId: string;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
  /** CNT-2 day boundary; per-user tz is seeding-deferred, so default UTC (0). */
  utcOffsetMinutes?: number;
}

export interface ReadUsableCounterDeps {
  cards: CardRepository;
  scheduler: Scheduler;
}

export interface UsableCounterResult {
  count: number;
  /** The counted words, so the surface can list them — not just the tally. */
  senseIds: string[];
}

/**
 * The "words you can now use" counter read-model (spec/10 CNT-2/3/4/6). For each of the user's cards
 * it reduces the persisted ReviewLogs to a spaced-judged-pass count (judgedPassLedger — INV-4 drops
 * cued/recognition/cloze) and reads live retrievability (CNT-3, evaluated at read time so the count
 * honestly ticks down between reviews — CNT-4). A word is counted when both gates pass (`isCounted`).
 *
 * This is a pure read — it never writes, never rates, never schedules.
 */
export async function readUsableCounter(
  input: ReadUsableCounterInput,
  deps: ReadUsableCounterDeps,
): Promise<UsableCounterResult> {
  const now = input.now ?? new Date();
  const offset = input.utcOffsetMinutes ?? 0;

  const cards = await deps.cards.listCards(input.userId);
  const senseIds: string[] = [];
  for (const card of cards) {
    const logs = await deps.cards.logsForWord(card.userId, card.senseId);
    const counted = isCounted({
      passDays: distinctPassDays(logs, offset),
      retrievability: deps.scheduler.getRetrievability(card.fsrs, now),
    });
    if (counted) senseIds.push(card.senseId);
  }
  return { count: senseIds.length, senseIds };
}
