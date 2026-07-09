import type { MasteryState } from "../mastery/card.js";
import type { ReviewLog, ReviewTier } from "./review.js";
import { nextSeenTier } from "../mastery/onRampLedger.js";
import { selectTier } from "./tier.js";

/**
 * LOOP-1 step 2: resolve which tier a word is presented at AND graded at. This is the single source
 * of truth for that decision, so the prompt the UI renders (`resolveReviewPrompt`) can never disagree
 * with the tier `runReviewPass` actually grades — a mismatch would show the wrong prompt for the
 * response being scored.
 *
 * `Seen` routes on ReviewLog history (the SM-3 two-step + RAT-7 drop-back, via `nextSeenTier`); every
 * other state routes on mastery alone (SM-1, via `selectTier`, which throws on `New` — its `New → Seen`
 * introduction is seeding, spec/09). `logs` are consulted only for `Seen`.
 */
export function resolveReviewTier(
  mastery: MasteryState,
  logs: readonly ReviewLog[],
): ReviewTier {
  if (mastery === "Seen") return nextSeenTier(logs);
  return selectTier(mastery);
}
