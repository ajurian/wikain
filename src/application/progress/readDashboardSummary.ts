import {
  tallyMastery,
  type LadderEntry,
} from "~/domain/mastery/masteryLadder.js";
import { judgedUsesOnDay } from "~/domain/mastery/judgedPassLedger.js";
import { newIntroductionsAllowed } from "~/domain/scheduling/introductionPacing.js";
import { evaluateSeedRail } from "~/domain/scheduling/seedRail.js";
import type { CardRepository } from "../ports/cardRepository.js";
import type { SettingsStore } from "../ports/settings.js";
import type { WordSource } from "../ports/wordSource.js";
import type { SeedLedgerStore } from "../ports/seedLedger.js";

export interface ReadDashboardSummaryInput {
  userId: string;
  /** SEED-2/5: the learner's persisted frontier band — the band the next session would seed at. */
  frontierBand: string;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
  /** CNT-8 day boundary; per-user tz is seeding-deferred, so default UTC (0). */
  utcOffsetMinutes?: number;
}

export interface ReadDashboardSummaryDeps {
  cards: CardRepository;
  settings: SettingsStore;
  /** SEED-5: selects the frontier words the next build would introduce (excluding already-carded). */
  wordSource: WordSource;
  /** SEED-10/BAT-14: the seed rail's `last_seed_at` — 0 new when a seed can't be granted today. */
  seedLedger: SeedLedgerStore;
}

export interface ReadDashboardSummaryResult {
  /** SM-1 mastery-ladder distribution (four carded rungs, ascending). */
  ladder: LadderEntry[];
  /** Cards due for review now (`fsrs.due <= now`). */
  dueReviews: number;
  /**
   * The EXACT number of new words the next session build would actually introduce — not the SEED-6
   * pacing ceiling. It is `min(newIntroductionsAllowed, un-carded frontier words available)` when the
   * SEED-10/BAT-14 seed rail would grant a seed today, and **0** when it would not (already seeded
   * today, within the min gap) or the frontier band is exhausted. Mirrors `seedIntroductions`'s own
   * computation exactly (same allowance, same exclude set, same `nextFrontierWords` call), as a
   * read-only dry run — so the count the learner sees equals the count the next `/review` seeds.
   */
  newIntroductions: number;
  /** CNT-8 daily-USE-goal progress: today's free judged passes (uses). */
  sentencesToday: number;
  /** CNT-8 goal target — the learner's persisted daily goal (DAILY_GOAL_DEFAULT until they adjust it). */
  dailyGoal: number;
}

/**
 * The dashboard read-model (spec/01 SM-1, spec/10 CNT-8, spec/11/09 SEED-6). A pure read over the
 * user's cards + persisted ReviewLogs + the seed ledger — it never writes, rates, or schedules (and
 * never *seeds*: `newIntroductions` is a read-only dry run of the seeder, not a side effect). Mirrors
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
  const dueReviews = cards.filter(
    (c) => c.fsrs.due.getTime() <= now.getTime(),
  ).length;

  // The exact new-intro count the next build would seed (SEED-6 pace ∩ real frontier supply), gated by
  // the SEED-10/BAT-14 seed rail: 0 when a seed can't be granted today, so the dashboard never
  // advertises intros the next `/review` won't deliver.
  const lastSeedAt = await deps.seedLedger.lastSeedAt(input.userId);
  const { granted } = evaluateSeedRail({ lastSeedAt, now, utcOffsetMinutes: offset });
  let newIntroductions = 0;
  if (granted) {
    const allowed = newIntroductionsAllowed({
      isFirstSession: cards.length === 0,
      dueBacklog: dueReviews,
    });
    if (allowed > 0) {
      const exclude = new Set(cards.map((c) => c.senseId));
      const senseIds = await deps.wordSource.nextFrontierWords(
        input.frontierBand,
        exclude,
        allowed,
      );
      newIntroductions = senseIds.length;
    }
  }

  let sentencesToday = 0;
  for (const card of cards) {
    const logs = await deps.cards.logsForWord(card.userId, card.senseId);
    sentencesToday += judgedUsesOnDay(logs, now, offset);
  }

  const { dailyGoal } = await deps.settings.read(input.userId);

  return {
    ladder: tallyMastery(cards),
    dueReviews,
    newIntroductions,
    sentencesToday,
    dailyGoal,
  };
}
