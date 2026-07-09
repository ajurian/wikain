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

/**
 * Which tier produced a review (spec/03 TIER-1). The two `Seen` on-ramp tiers (`recognition`,
 * `cloze`) and the deterministic `cued` tier are graded without the judge; `free` is judged. INV-4
 * keys off `tier === "free"` — the judged-pass ledger/counter filter on it, so the deterministic
 * tiers never count toward the counter or Fluent.
 */
export type ReviewTier = "recognition" | "cloze" | "cued" | "free";

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
  /**
   * RAT-5 / SM-9: whether the production was scaffolded (hint / sentence starter). Instrumented from
   * day one even though v1 does not rate on it (it gates Fluent, not the rating). Absent on
   * deterministic tiers (cued), which carry no scaffolding.
   */
  scaffolded?: boolean;
  /**
   * RAT-5: how many rule-layer bounces preceded this graded attempt (0 = gradeable on the first try).
   * Persisted from day one for the v2 4-button mapping; v1 does not rate on it. Absent on deterministic
   * tiers, which have no rule layer.
   */
  retryCount?: number;
  /**
   * RAT-5: whether a typo-tolerance correction was applied before grading. Always absent/false in v1 —
   * cloze typo tolerance is Deferred (spec/02) — but the signal is captured from day one so no history
   * is lost the day tolerance ships.
   */
  typoFixed?: boolean;
  /**
   * RAT-5: latency of the graded attempt in milliseconds (submit → gradeable outcome), when the caller
   * measured it. Absent when not measured. For v2 hesitation signals; v1 does not read it.
   */
  latencyMs?: number;
  /** The raw FSRS scheduling log (RAT-8). */
  fsrs: FsrsReviewLog;
}
