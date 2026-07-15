import { deriveRating, type Rating } from "~/domain/review/rating.js";
import type { Card, MasteryState } from "~/domain/mastery/card.js";
import type { LexicalItem } from "~/domain/lexicalItem.js";
import type { ReviewLog, ReviewTier } from "~/domain/review/review.js";
import type { Catalog } from "../ports/catalog.js";
import type { CardRepository } from "../ports/cardRepository.js";
import type { Scheduler } from "../ports/scheduler.js";

export interface DeterministicReviewInput {
  userId: string;
  senseId: string;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
}

/** The ports every deterministic tier needs. Tier-specific graders own any extra ports (lemmatizer). */
export interface DeterministicReviewDeps {
  catalog: Catalog;
  cards: CardRepository;
  scheduler: Scheduler;
}

export interface DeterministicReviewResult {
  passed: boolean;
  rating: Rating;
  mastery: MasteryState;
  due: Date;
}

/**
 * The behaviour that varies between the three deterministic tiers (recognition, cloze, cued): how the
 * response is graded, how a result promotes the mastery ladder, and which tier the log is tagged
 * with. Injected as a strategy (COMP-1) so new tiers are added as config, never by editing this core
 * (SOLID-2). `grade` closes over the tier's response + extra ports (e.g. the lemmatizer).
 */
export interface DeterministicReviewStrategy {
  tier: Extract<ReviewTier, "recognition" | "cloze" | "cued">;
  /**
   * Async because the typed tiers grade through the NLP port, which is now out-of-process. Still
   * deterministic (TIER-1) — no judge, no LLM. Recognition ignores the asynchrony entirely.
   */
  grade: (item: LexicalItem) => Promise<boolean> | boolean;
  promote: (state: MasteryState, passed: boolean) => MasteryState;
  /**
   * RAT-5 / FIT-10 instrumentation recorded on the single ReviewLog, owned by the tier: the typed
   * tiers record the signals that apply to them (`typoFixed`; cloze adds its soft-bounce history),
   * recognition records none — an absent signal stays absent, never a fabricated 0/false.
   */
  logExtras?: Partial<Pick<ReviewLog, "typoFixed" | "softBounceCount" | "softBounceLanes">>;
}

/**
 * The shared skeleton of the three deterministic (no-LLM) review tiers — spec/03 TIER-1/TIER-3/TIER-5,
 * the cued/cloze/recognition branches of the loop (spec/11 LOOP-2). Extracted once the third tier
 * appeared (rule of three, PRAG-3); the per-tier grading + promotion are the only variation points.
 * It realizes:
 *  - TIER-1: grading is deterministic — no judge/LLM is reached.
 *  - RAT-1: binary rating; RAT-6 / INV-3: the scheduler advances independently of mastery state.
 *  - SM-6: a deterministic-tier fail reschedules but NEVER demotes — the promotion strategy leaves a
 *    failing state untouched (there is no demotion path in this core at all).
 *  - RAT-8 / DM-6: exactly one ReviewLog persisted per rated review (a deterministic tier always
 *    rates — INV-2's no-rating path governs only free production, not this core).
 */
export async function submitDeterministicReview(
  input: DeterministicReviewInput,
  deps: DeterministicReviewDeps,
  strategy: DeterministicReviewStrategy,
): Promise<DeterministicReviewResult> {
  const now = input.now ?? new Date();

  const item = deps.catalog.get(input.senseId);
  if (item === undefined) throw new Error(`unknown sense_id: ${input.senseId}`);

  const card = await deps.cards.load(input.userId, input.senseId);
  if (card === undefined) {
    throw new Error(`no card for user ${input.userId} / sense ${input.senseId}`);
  }

  const passed = await strategy.grade(item);
  // RAT-1.
  const rating = deriveRating(passed);
  // RAT-6 / INV-3: a graded (non-bounce) deterministic outcome advances the FSRS schedule.
  const { card: nextFsrs, log: fsrsLog } = deps.scheduler.next(card.fsrs, rating, now);
  // SM-6: a deterministic fail leaves the mastery ladder unchanged (each strategy's `promote` is a
  // pass-only advance with no demotion rung).
  const mastery = strategy.promote(card.mastery, passed);

  const updated: Card = { ...card, mastery, fsrs: nextFsrs };
  await deps.cards.save(updated);
  // RAT-8 / DM-6: one ReviewLog per rated review. RAT-5 / FIT-10: each tier owns which richer
  // signals it measures (`logExtras`) — recognition records none, cued records `typoFixed: false`,
  // cloze records the typo lane + its soft-bounce history. An unmeasured signal stays absent.
  await deps.cards.appendReviewLog({
    userId: input.userId,
    senseId: input.senseId,
    tier: strategy.tier,
    rating,
    reviewedAt: now,
    ...(strategy.logExtras ?? {}),
    fsrs: fsrsLog,
  });

  return { passed, rating, mastery, due: nextFsrs.due };
}
