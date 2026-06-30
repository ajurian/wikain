/** The binary FSRS rating used in v1 (spec/02-fsrs-rating.md RAT-1). */
export type Rating = "Again" | "Good";

/**
 * RAT-1: any gate pass → `Good`; any gate fail → `Again`. Ratings are system-derived, never
 * self-reported; `Hard`/`Easy` MUST NOT be synthesized in v1.
 */
export function deriveRating(passed: boolean): Rating {
  return passed ? "Good" : "Again";
}
