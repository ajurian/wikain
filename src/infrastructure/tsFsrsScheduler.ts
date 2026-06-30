/**
 * Scheduler adapter (RAT-6) backed by ts-fsrs. Maps the binary domain Rating (RAT-1) to the FSRS
 * grade and confines the ts-fsrs types to this boundary, so application/domain stay library-free
 * (ARCH-3). `request_retention` is left at the ts-fsrs default for now (REQUEST_RETENTION tuning is
 * SEED-deferred).
 */
import { createEmptyCard, fsrs, Rating as FsrsRating, type Card as FsrsCard, type FSRS } from "ts-fsrs";
import type { Scheduler } from "../application/ports/scheduler.js";
import type { FsrsCardState } from "../domain/card.js";
import type { FsrsReviewLog } from "../domain/review.js";
import type { Rating } from "../domain/rating.js";

export class TsFsrsScheduler implements Scheduler {
  private readonly engine: FSRS = fsrs();

  newCard(now: Date): FsrsCardState {
    return createEmptyCard(now);
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
}
