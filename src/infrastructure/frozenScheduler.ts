import type { FsrsCardState } from "~/domain/mastery/card.js";
import type { FsrsReviewLog } from "~/domain/review/review.js";
import type { Rating } from "~/domain/review/rating.js";
import type { ColdStart, Scheduler } from "~/application/ports/scheduler.js";

/**
 * DEV ONLY: a `Scheduler` decorator that freezes FSRS scheduling — the Dev Tools "freeze FSRS" toggle.
 *
 * `next()` returns the card's state **unchanged** (its `due` never advances, so it stays in rotation)
 * while still producing a real FSRS `log` from the wrapped scheduler. Returning a valid log is what
 * keeps the rest of the loop honest: the `ReviewLog` is still written, so mastery promotions/demotions
 * — which replay from logs, not from the FSRS interval — remain visible while you re-drive one card.
 *
 * `newCard` and `getRetrievability` delegate untouched: freezing is about not *advancing* an existing
 * schedule, not about faking cold-start or the forgetting curve.
 */
export class FrozenScheduler implements Scheduler {
  constructor(private readonly inner: Scheduler) {}

  newCard(now: Date, coldStart?: ColdStart): FsrsCardState {
    return this.inner.newCard(now, coldStart);
  }

  next(
    card: FsrsCardState,
    rating: Rating,
    now: Date,
  ): { card: FsrsCardState; log: FsrsReviewLog } {
    // Compute the real log (so a valid ReviewLog is still recorded) but discard the advanced card —
    // the schedule holds where it was, keeping the card perpetually due.
    const { log } = this.inner.next(card, rating, now);
    return { card, log };
  }

  getRetrievability(card: FsrsCardState, now: Date): number {
    return this.inner.getRetrievability(card, now);
  }
}
