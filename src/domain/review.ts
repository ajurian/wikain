import type { Rating } from "./rating.js";

/**
 * FSRS review log — structurally the ts-fsrs `ReviewLog`. Declared here so the domain stays
 * library-free (ARCH-1); the scheduler adapter maps the ts-fsrs type at the boundary.
 */
export interface FsrsReviewLog {
  rating: number;
  state: number;
  due: Date;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  last_elapsed_days: number;
  scheduled_days: number;
  review: Date;
}

/** Which tier produced a review. Extends as further tiers land (recognition, cloze, free, …). */
export type ReviewTier = "cued";

/**
 * One graded interaction (spec/12-data-model.md DM-1 review layer). Persisted from review #1
 * (RAT-8, DM-6) as the sole input to per-user optimization. A rule-layer bounce produces NO
 * ReviewLog (INV-2) — not applicable to deterministic tiers, which always rate.
 */
export interface ReviewLog {
  userId: string;
  senseId: string;
  tier: ReviewTier;
  rating: Rating;
  reviewedAt: Date;
  /** The raw FSRS scheduling log (RAT-8). */
  fsrs: FsrsReviewLog;
}
