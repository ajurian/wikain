import type { FsrsCardState } from "../../domain/card.js";
import type { FsrsReviewLog } from "../../domain/review.js";
import type { Rating } from "../../domain/rating.js";

/**
 * FSRS scheduling port (spec/02-fsrs-rating.md RAT-6). Implemented by the ts-fsrs adapter in
 * infrastructure (ARCH-3); the application sees only the binary domain Rating in and the next card
 * state + review log out — never the scheduling library itself.
 */
export interface Scheduler {
  /** A fresh card for a newly introduced word (lazy cold-start — SEED-7, DM-5). */
  newCard(now: Date): FsrsCardState;
  /** Apply a rating, returning the next card state + the FSRS review log (RAT-1, RAT-8). */
  next(
    card: FsrsCardState,
    rating: Rating,
    now: Date,
  ): { card: FsrsCardState; log: FsrsReviewLog };
  /**
   * Current retrievability in [0,1] of a card at `now` (the FSRS forgetting curve). Read live (not
   * stored) so the counter ticks down between reviews (spec/10 CNT-3). Distinct from scheduling: this
   * gates the headline metric at COUNTER_R_FLOOR, not REQUEST_RETENTION.
   */
  getRetrievability(card: FsrsCardState, now: Date): number;
}
