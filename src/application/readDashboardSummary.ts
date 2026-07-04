import { tallyMastery, type LadderEntry } from "../domain/masteryLadder.js";
import { judgedUsesOnDay } from "../domain/judgedPassLedger.js";
import { newIntroductionsAllowed } from "../domain/introductionPacing.js";
import { DAILY_GOAL_DEFAULT } from "../domain/constants.js";
import type { CardRepository } from "./ports/cardRepository.js";

export interface ReadDashboardSummaryInput {
  userId: string;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
  /** CNT-8 day boundary; per-user tz is seeding-deferred, so default UTC (0). */
  utcOffsetMinutes?: number;
}

export interface ReadDashboardSummaryDeps {
  cards: CardRepository;
}

export interface ReadDashboardSummaryResult {
  /** SM-1 mastery-ladder distribution (four carded rungs, ascending). */
  ladder: LadderEntry[];
  /** Cards due for review now (`fsrs.due <= now`). */
  dueReviews: number;
  /**
   * SEED-6 pacing allowance — how many new words *may* be woven into the next session ("up to N new").
   * Not a remaining-today figure: there is no per-calendar-day intro ledger yet (deferred), so this is
   * the allowance the seeder would use, recomputed on each read.
   */
  newIntroductions: number;
  /** CNT-8 daily-USE-goal progress: today's free judged passes (uses). */
  sentencesToday: number;
  /** CNT-8 goal target — the fixed default until a learner-adjustable setting persists (STACK-4). */
  dailyGoal: number;
}

/**
 * The dashboard read-model (spec/01 SM-1, spec/10 CNT-8, spec/11/09 SEED-6). A pure read over the
 * user's cards + persisted ReviewLogs — it never writes, rates, or schedules (and never *seeds*: the
 * `newIntroductions` figure is the pacing allowance, computed without side effects). Mirrors
 * `readUsableCounter`'s Input/Deps/Result shape; no scheduler is needed because the ladder, due count,
 * pacing, and daily-use goal derive from persisted card fields + logs, not live retrievability (that
 * gate is the counter's concern).
 */
export async function readDashboardSummary(
  input: ReadDashboardSummaryInput,
  deps: ReadDashboardSummaryDeps,
): Promise<ReadDashboardSummaryResult> {
  const now = input.now ?? new Date();
  const offset = input.utcOffsetMinutes ?? 0;

  const cards = await deps.cards.listCards(input.userId);

  // Due predicate mirrors sessionQueue.ts / startSession (fsrs.due <= now, inclusive).
  const dueReviews = cards.filter((c) => c.fsrs.due.getTime() <= now.getTime()).length;

  const newIntroductions = newIntroductionsAllowed({
    isFirstSession: cards.length === 0,
    dueBacklog: dueReviews,
  });

  let sentencesToday = 0;
  for (const card of cards) {
    const logs = await deps.cards.logsForWord(card.userId, card.senseId);
    sentencesToday += judgedUsesOnDay(logs, now, offset);
  }

  return {
    ladder: tallyMastery(cards),
    dueReviews,
    newIntroductions,
    sentencesToday,
    dailyGoal: DAILY_GOAL_DEFAULT,
  };
}
