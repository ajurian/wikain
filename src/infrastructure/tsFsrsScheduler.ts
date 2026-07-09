/**
 * Scheduler adapter (RAT-6) backed by ts-fsrs. Maps the binary domain Rating (RAT-1) to the FSRS
 * grade and confines the ts-fsrs types to this boundary, so application/domain stay library-free
 * (ARCH-3). The engine is configured with `request_retention = REQUEST_RETENTION` (SEED-8); per-user
 * optimization above the review threshold is [v2] (deferred).
 */
import { createEmptyCard, fsrs, Rating as FsrsRating, type Card as FsrsCard, type FSRS } from "ts-fsrs";
import type { ColdStart, Scheduler } from "~/application/ports/scheduler.js";
import type { FsrsCardState } from "~/domain/mastery/card.js";
import type { FsrsReviewLog } from "~/domain/review/review.js";
import type { Rating } from "~/domain/review/rating.js";
import { REQUEST_RETENTION } from "~/domain/constants.js";

export class TsFsrsScheduler implements Scheduler {
  private readonly engine: FSRS = fsrs({ request_retention: REQUEST_RETENTION });

  newCard(now: Date, coldStart?: ColdStart): FsrsCardState {
    const card = createEmptyCard(now);
    // SEED-8: apply the CEFR×band difficulty estimate. ts-fsrs recomputes difficulty/stability from
    // its own init weights on the FIRST graded review (the card is still in State.New here), so this
    // seed is the pre-first-review estimate (queue ordering / display), not a permanent override.
    if (coldStart) card.difficulty = coldStart.difficulty;
    return card;
  }

  next(
    card: FsrsCardState,
    rating: Rating,
    now: Date,
  ): { card: FsrsCardState; log: FsrsReviewLog } {
    const grade = rating === "Good" ? FsrsRating.Good : FsrsRating.Again;
    // FsrsCardState differs from the ts-fsrs Card only in `state` (number vs the State enum); the
    // runtime shapes are identical. Assert at the input boundary; the returned Card/ReviewLog flow
    // back as the domain's structural types unchanged (enum members are numbers).
    const { card: nextCard, log } = this.engine.next(card as FsrsCard, now, grade);
    return { card: nextCard, log };
  }

  getRetrievability(card: FsrsCardState, now: Date): number {
    // `format=false` returns the raw forgetting-curve probability in [0,1] (CNT-3) rather than the
    // ts-fsrs default percentage string. Same input-boundary cast as `next` (FsrsCardState only
    // differs in `state` typing).
    return this.engine.get_retrievability(card as FsrsCard, now, false);
  }
}
