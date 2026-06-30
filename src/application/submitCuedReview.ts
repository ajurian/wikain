import { isLemmaMatch } from "../domain/grading.js";
import { promoteOnCuedPass } from "../domain/mastery.js";
import { deriveRating, type Rating } from "../domain/rating.js";
import type { Card, MasteryState } from "../domain/card.js";
import type { Catalog } from "./ports/catalog.js";
import type { CardRepository } from "./ports/cardRepository.js";
import type { Lemmatizer } from "./ports/lemmatizer.js";
import type { Scheduler } from "./ports/scheduler.js";

export interface SubmitCuedReviewInput {
  userId: string;
  senseId: string;
  response: string;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
}

export interface SubmitCuedReviewDeps {
  catalog: Catalog;
  cards: CardRepository;
  scheduler: Scheduler;
  lemmatizer: Lemmatizer;
}

export interface SubmitCuedReviewResult {
  passed: boolean;
  rating: Rating;
  mastery: MasteryState;
  due: Date;
}

/**
 * The cued-production review pass — the deterministic branch of the end-to-end loop
 * (spec/11-end-to-end-loop.md LOOP). It realizes:
 *  - TIER-3 / TIER-5: deterministic, inflection-agnostic lemma-match grading (no judge/LLM, INV-1).
 *  - RAT-1: binary rating; RAT-6 / INV-3: the scheduler advances independently of mastery state.
 *  - SM-4: a pass promotes Recognized → Productive; SM-6: a deterministic fail reschedules but
 *    never demotes (mastery is left untouched).
 *  - RAT-8 / DM-6: exactly one ReviewLog persisted per rated review.
 *
 * A deterministic tier has no rule-layer bounce, so every submission produces a rating (INV-2 / the
 * no-rating path governs free production, spec/04 + spec/08, not this tier).
 */
export async function submitCuedReview(
  input: SubmitCuedReviewInput,
  deps: SubmitCuedReviewDeps,
): Promise<SubmitCuedReviewResult> {
  const now = input.now ?? new Date();

  const item = deps.catalog.get(input.senseId);
  if (item === undefined) throw new Error(`unknown sense_id: ${input.senseId}`);

  const card = await deps.cards.load(input.userId, input.senseId);
  if (card === undefined) {
    throw new Error(`no card for user ${input.userId} / sense ${input.senseId}`);
  }

  // TIER-3 / TIER-5: accept any en-US inflected form of the target lemma.
  const passed = isLemmaMatch(deps.lemmatizer.formsOf(input.response), item.lemma);
  // RAT-1.
  const rating = deriveRating(passed);
  // RAT-6 / INV-3: a graded (non-bounce) deterministic outcome advances the FSRS schedule.
  const { card: nextFsrs, log: fsrsLog } = deps.scheduler.next(card.fsrs, rating, now);
  // SM-4 on a pass; SM-6: a cued fail leaves the mastery ladder unchanged (no demotion).
  const mastery = passed ? promoteOnCuedPass(card.mastery) : card.mastery;

  const updated: Card = { ...card, mastery, fsrs: nextFsrs };
  await deps.cards.save(updated);
  // RAT-8 / DM-6: one ReviewLog per rated review.
  await deps.cards.appendReviewLog({
    userId: input.userId,
    senseId: input.senseId,
    tier: "cued",
    rating,
    reviewedAt: now,
    fsrs: fsrsLog,
  });

  return { passed, rating, mastery, due: nextFsrs.due };
}
