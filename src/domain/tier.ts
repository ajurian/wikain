import type { MasteryState } from "./card.js";
import type { ReviewTier } from "./review.js";

/**
 * SM-1 / LOOP-1 step 2: a word's mastery state selects the tier presented. `Recognized` → the
 * deterministic cued tier; `Productive` → judged free production; `Fluent` → judged maintenance (the
 * same judged branch, re-applied every rep — spec/11 note + JDG-8).
 *
 * `Seen` is NOT resolved here: its on-ramp tier (recognition MCQ vs cloze, SM-3) depends on the word's
 * ReviewLog history, not on mastery alone, so `runReviewPass` routes it upstream via
 * `onRampLedger.nextSeenTier`. Reaching this function with `Seen` is therefore a routing bug and throws
 * loud. The `New` pre-state has no tier at all — its `New → Seen` introduction is seeding (spec/09,
 * deferred, PRAG-1).
 */
export function selectTier(mastery: MasteryState): Extract<ReviewTier, "cued" | "free"> {
  switch (mastery) {
    case "Recognized":
      return "cued";
    case "Productive":
    case "Fluent":
      return "free";
    case "Seen":
      throw new Error("Seen is routed via onRampLedger.nextSeenTier in runReviewPass, not selectTier");
    case "New":
      throw new Error("tier for mastery 'New' is deferred (New → Seen introduction is seeding, spec/09)");
  }
}
