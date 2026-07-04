import { describe, it, expect } from "vitest";
import { deriveMasteryHistory } from "./masteryHistory.js";
import type { FsrsReviewLog, ReviewLog, ReviewTier } from "./review.js";
import type { Rating } from "./rating.js";
import { FLUENT_MIN_STABILITY_DAYS } from "./constants.js";

const USER = "u1";
const SENSE = "negotiate_verb_01";

function fsrsLog(stability: number): FsrsReviewLog {
  return {
    rating: 3,
    state: 2,
    due: new Date("2026-06-30T00:00:00Z"),
    stability,
    difficulty: 5,
    elapsed_days: 0,
    last_elapsed_days: 0,
    scheduled_days: 1,
    review: new Date("2026-06-30T00:00:00Z"),
  };
}

function log(
  reviewedAt: string,
  tier: ReviewTier,
  rating: Rating,
  opts: { stability?: number; scaffolded?: boolean } = {},
): ReviewLog {
  return {
    userId: USER,
    senseId: SENSE,
    tier,
    rating,
    reviewedAt: new Date(reviewedAt),
    scaffolded: opts.scaffolded,
    fsrs: fsrsLog(opts.stability ?? 1),
  };
}

function firstOf(logs: ReviewLog[]) {
  const [entry] = deriveMasteryHistory(logs);
  if (!entry) throw new Error("expected at least one history entry");
  return entry;
}

describe("deriveMasteryHistory", () => {
  it("returns an empty history when there are no logs", () => {
    expect(deriveMasteryHistory([])).toEqual([]);
  });

  it("SM-3: a first recognition MCQ pass does not move the ladder (Seen stays Seen)", () => {
    const entry = firstOf([log("2026-06-21T09:00:00Z", "recognition", "Good")]);
    expect(entry.tier).toBe("recognition");
    expect(entry.outcome).toBe("pass");
    expect(entry.moved).toBeUndefined();
  });

  it("SM-3: a cloze pass promotes Seen → Recognized", () => {
    const entries = deriveMasteryHistory([
      log("2026-06-21T09:00:00Z", "recognition", "Good"),
      log("2026-06-24T09:00:00Z", "cloze", "Good"),
    ]);
    expect(entries[1]!.moved).toEqual({ from: "Seen", to: "Recognized" });
  });

  it("SM-4: a cued pass promotes Recognized → Productive", () => {
    const entries = deriveMasteryHistory([
      log("2026-06-21T09:00:00Z", "cloze", "Good"), // Seen → Recognized
      log("2026-06-27T09:00:00Z", "cued", "Good"), // Recognized → Productive
    ]);
    expect(entries[1]!.moved).toEqual({ from: "Recognized", to: "Productive" });
  });

  it("SM-6: a deterministic-tier fail never demotes (no move)", () => {
    const entries = deriveMasteryHistory([
      log("2026-06-21T09:00:00Z", "cloze", "Good"), // Seen → Recognized
      log("2026-06-27T09:00:00Z", "cued", "Again"), // fail, stays Recognized
    ]);
    expect(entries[1]!.outcome).toBe("fail");
    expect(entries[1]!.moved).toBeUndefined();
  });

  it("SM-7: a failed free judged production demotes one rung", () => {
    const entries = deriveMasteryHistory([
      log("2026-06-21T09:00:00Z", "cued", "Good"), // Recognized → Productive (seeded from cued)
      log("2026-06-26T09:00:00Z", "free", "Again"), // Productive → Recognized
    ]);
    expect(entries[1]!.moved).toEqual({ from: "Productive", to: "Recognized" });
  });

  it("SM-5: three spaced unscaffolded judged passes over a stable card promote Productive → Fluent", () => {
    const S = FLUENT_MIN_STABILITY_DAYS + 1;
    const entries = deriveMasteryHistory([
      log("2026-06-01T09:00:00Z", "cued", "Good"), // → Productive
      log("2026-06-05T09:00:00Z", "free", "Good", { stability: S }), // pass day 1
      log("2026-06-10T09:00:00Z", "free", "Good", { stability: S }), // pass day 2
      log("2026-06-16T09:00:00Z", "free", "Good", { stability: S }), // pass day 3 → gate met
    ]);
    expect(entries[3]!.moved).toEqual({ from: "Productive", to: "Fluent" });
    // the earlier passes did not yet qualify
    expect(entries[1]!.moved).toBeUndefined();
    expect(entries[2]!.moved).toBeUndefined();
  });

  it("SM-5(d): a scaffolded most-recent pass does not qualify for Fluent even with enough spaced passes", () => {
    const S = FLUENT_MIN_STABILITY_DAYS + 1;
    const entries = deriveMasteryHistory([
      log("2026-06-01T09:00:00Z", "cued", "Good"),
      log("2026-06-05T09:00:00Z", "free", "Good", { stability: S }),
      log("2026-06-10T09:00:00Z", "free", "Good", { stability: S }),
      log("2026-06-16T09:00:00Z", "free", "Good", { stability: S, scaffolded: true }),
    ]);
    expect(entries[3]!.moved).toBeUndefined();
  });

  it("labels the calendar day and outcome for each entry", () => {
    const entry = firstOf([log("2026-06-21T09:00:00Z", "free", "Again")]);
    expect(entry.day).toBe("2026-06-21");
    expect(entry.outcome).toBe("fail");
  });
});
