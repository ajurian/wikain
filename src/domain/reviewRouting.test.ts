import { describe, it, expect } from "vitest";
import { resolveReviewTier } from "./reviewRouting.js";
import type { ReviewLog } from "./review.js";

/** A minimal recognition-pass log — enough to advance the Seen on-ramp to the cloze (SM-3). */
function recognitionPass(): ReviewLog {
  return {
    userId: "u1",
    senseId: "s1",
    tier: "recognition",
    rating: "Good",
    reviewedAt: new Date("2026-07-01T00:00:00Z"),
    fsrs: {
      rating: 3,
      state: 0,
      due: new Date(0),
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      last_elapsed_days: 0,
      scheduled_days: 0,
      review: new Date(0),
    },
  };
}

describe("resolveReviewTier (LOOP-1 step 2: single source of truth for tier routing)", () => {
  it("SM-3: a freshly-entered Seen word routes to recognition (log history empty)", () => {
    expect(resolveReviewTier("Seen", [])).toBe("recognition");
  });

  it("SM-3: a Seen word past its MCQ pass routes to cloze (from ReviewLog history)", () => {
    expect(resolveReviewTier("Seen", [recognitionPass()])).toBe("cloze");
  });

  it("SM-1: Recognized routes to the deterministic cued tier", () => {
    expect(resolveReviewTier("Recognized", [])).toBe("cued");
  });

  it("SM-1: Productive routes to judged free production", () => {
    expect(resolveReviewTier("Productive", [])).toBe("free");
  });

  it("SM-1: Fluent routes to judged maintenance (free branch)", () => {
    expect(resolveReviewTier("Fluent", [])).toBe("free");
  });

  it("New has no tier (its New → Seen introduction is seeding) — throws", () => {
    expect(() => resolveReviewTier("New", [])).toThrow();
  });
});
