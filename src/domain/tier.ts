import type { MasteryState } from "./card.js";
import type { ReviewTier } from "./review.js";

/**
 * SM-1 / LOOP-1 step 2: a word's mastery state selects the tier presented. `Recognized` → the
 * deterministic cued tier; `Productive` → judged free production; `Fluent` → judged maintenance (the
 * same judged branch, re-applied every rep — spec/11 note + JDG-8). The `Seen` on-ramp (recognition
 * MCQ → cloze, SM-3) and the `New` pre-state have no tier wired in this slice (PRAG-1) — they throw
 * rather than silently routing somewhere wrong.
 */
export function selectTier(mastery: MasteryState): ReviewTier {
  switch (mastery) {
    case "Recognized":
      return "cued";
    case "Productive":
    case "Fluent":
      return "free";
    case "Seen":
    case "New":
      throw new Error(
        `tier for mastery '${mastery}' is deferred (Seen on-ramp / New — spec/03, SM-3)`,
      );
  }
}
