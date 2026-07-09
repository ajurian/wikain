import { describe, it, expect } from "vitest";
import { nextSeenTier } from "./onRampLedger.js";
import type { ReviewLog } from "../review/review.js";
import type { ReviewTier } from "../review/review.js";
import type { Rating } from "../review/rating.js";

/**
 * The ledger reads only `tier` + `rating` (the fold replays logs in append order); the FSRS payload
 * is irrelevant here, so a minimal factory keeps each scenario legible.
 */
function log(tier: ReviewTier, rating: Rating): ReviewLog {
  return {
    userId: "u1",
    senseId: "s1",
    tier,
    rating,
    reviewedAt: new Date("2026-07-01T00:00:00Z"),
    fsrs: {
      rating: rating === "Good" ? 3 : 1,
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

describe("SM-3 Seen on-ramp sequencing", () => {
  it("a freshly-entered Seen word shows the meaning→word MCQ first", () => {
    expect(nextSeenTier([])).toBe("recognition");
  });

  it("a passing MCQ advances the next presentation to the cloze", () => {
    expect(nextSeenTier([log("recognition", "Good")])).toBe("cloze");
  });

  it("a failing MCQ keeps the next presentation on the MCQ (must pass it first)", () => {
    expect(nextSeenTier([log("recognition", "Again")])).toBe("recognition");
  });
});

describe("RAT-7 Seen cloze-fail drop-back (cap = 1)", () => {
  it("the first cloze fail drops the next presentation back to the MCQ once", () => {
    const logs = [log("recognition", "Good"), log("cloze", "Again")];
    expect(nextSeenTier(logs)).toBe("recognition");
  });

  it("after the one MCQ drop-back rep, the next presentation re-attempts cloze", () => {
    const logs = [
      log("recognition", "Good"),
      log("cloze", "Again"),
      log("recognition", "Again"), // the single drop-back rep — result does not matter (RAT-7)
    ];
    expect(nextSeenTier(logs)).toBe("cloze");
  });

  it("a second cloze fail stays on cloze — no MCQ↔cloze ping-pong", () => {
    const logs = [
      log("recognition", "Good"),
      log("cloze", "Again"),
      log("recognition", "Good"), // drop-back rep consumed
      log("cloze", "Again"), // second cloze fail: cap reached
    ];
    expect(nextSeenTier(logs)).toBe("cloze");
  });
});
