import { describe, it, expect } from "vitest";
import {
  distinctPassDays,
  judgedUsesOnDay,
  mostRecentPassScaffolded,
} from "./judgedPassLedger.js";
import type { FsrsReviewLog, ReviewLog, ReviewTier } from "../review/review.js";
import type { Rating } from "../review/rating.js";

const FSRS_STUB: FsrsReviewLog = {
  rating: 3,
  state: 2,
  due: new Date("2026-06-30T00:00:00Z"),
  stability: 1,
  difficulty: 5,
  elapsed_days: 0,
  last_elapsed_days: 0,
  scheduled_days: 1,
  review: new Date("2026-06-30T00:00:00Z"),
};

function log(
  reviewedAt: string,
  opts: { tier?: ReviewTier; rating?: Rating; scaffolded?: boolean } = {},
): ReviewLog {
  return {
    userId: "u1",
    senseId: "negotiate_verb_01",
    tier: opts.tier ?? "free",
    rating: opts.rating ?? "Good",
    reviewedAt: new Date(reviewedAt),
    scaffolded: opts.scaffolded,
    fsrs: FSRS_STUB,
  };
}

describe("distinctPassDays (SM-5 a/b, CNT-2)", () => {
  it("counts distinct calendar days bearing a passing free judged production", () => {
    const logs = [
      log("2026-06-01T09:00:00Z"),
      log("2026-06-02T09:00:00Z"),
      log("2026-06-03T09:00:00Z"),
    ];
    expect(distinctPassDays(logs)).toBe(3);
  });

  it("collapses two passes on the same calendar day to one (spacing requirement)", () => {
    const logs = [log("2026-06-01T08:00:00Z"), log("2026-06-01T20:00:00Z")];
    expect(distinctPassDays(logs)).toBe(1);
  });

  it("INV-4: ignores cued (deterministic) passes — only free judged passes count", () => {
    const logs = [
      log("2026-06-01T09:00:00Z", { tier: "cued" }),
      log("2026-06-02T09:00:00Z", { tier: "cued" }),
      log("2026-06-03T09:00:00Z", { tier: "free" }),
    ];
    expect(distinctPassDays(logs)).toBe(1);
  });

  it("ignores failing free productions (Again is not a pass)", () => {
    const logs = [
      log("2026-06-01T09:00:00Z", { rating: "Again" }),
      log("2026-06-02T09:00:00Z", { rating: "Good" }),
    ];
    expect(distinctPassDays(logs)).toBe(1);
  });

  it("uses the user-local day boundary (injected UTC offset) when grouping", () => {
    // Two passes 4h apart that straddle UTC midnight but fall on the SAME PH day (UTC+8):
    // 2026-06-01T20:00Z = Jun 2 04:00 +08; 2026-06-01T22:00Z = Jun 2 06:00 +08 → 1 day.
    const logs = [log("2026-06-01T20:00:00Z"), log("2026-06-01T22:00:00Z")];
    expect(distinctPassDays(logs)).toBe(1);
    expect(distinctPassDays(logs, 8 * 60)).toBe(1);
    // In UTC they are also the same day here; shift one earlier to prove the offset matters:
    const straddle = [log("2026-06-01T15:00:00Z"), log("2026-06-01T20:00:00Z")];
    expect(distinctPassDays(straddle)).toBe(1); // both Jun 1 UTC
    expect(distinctPassDays(straddle, 8 * 60)).toBe(2); // Jun 1 23:00 vs Jun 2 04:00 PH
  });
});

describe("judgedUsesOnDay (CNT-8 daily-use goal)", () => {
  const NOW = new Date("2026-06-03T12:00:00Z");

  it("counts free judged passes on the given day as USES, not distinct days", () => {
    // Unlike distinctPassDays, two passes on the same day count as two productive uses.
    const logs = [log("2026-06-03T08:00:00Z"), log("2026-06-03T20:00:00Z")];
    expect(judgedUsesOnDay(logs, NOW)).toBe(2);
    expect(distinctPassDays(logs)).toBe(1);
  });

  it("ignores passes on other calendar days", () => {
    const logs = [
      log("2026-06-02T09:00:00Z"),
      log("2026-06-03T09:00:00Z"),
      log("2026-06-04T09:00:00Z"),
    ];
    expect(judgedUsesOnDay(logs, NOW)).toBe(1);
  });

  it("INV-4: a new introduction / deterministic pass on today does not advance the use goal", () => {
    const logs = [
      log("2026-06-03T09:00:00Z", { tier: "recognition" }),
      log("2026-06-03T10:00:00Z", { tier: "cloze" }),
      log("2026-06-03T11:00:00Z", { tier: "cued" }),
    ];
    expect(judgedUsesOnDay(logs, NOW)).toBe(0);
  });

  it("ignores failing free productions on today", () => {
    const logs = [
      log("2026-06-03T09:00:00Z", { rating: "Again" }),
      log("2026-06-03T10:00:00Z", { rating: "Good" }),
    ];
    expect(judgedUsesOnDay(logs, NOW)).toBe(1);
  });

  it("uses the injected UTC offset for the day boundary", () => {
    // 2026-06-03T18:00Z = Jun 4 02:00 +08 → a different PH day from NOW (Jun 3 20:00 +08).
    const logs = [log("2026-06-03T18:00:00Z")];
    expect(judgedUsesOnDay(logs, NOW)).toBe(1); // same UTC day
    expect(judgedUsesOnDay(logs, NOW, 8 * 60)).toBe(0); // Jun 4 PH ≠ Jun 3 PH
  });
});

describe("mostRecentPassScaffolded (SM-5 d, SM-9)", () => {
  it("returns the scaffolded flag of the latest passing free production", () => {
    const logs = [
      log("2026-06-01T09:00:00Z", { scaffolded: true }),
      log("2026-06-03T09:00:00Z", { scaffolded: false }),
      log("2026-06-02T09:00:00Z", { scaffolded: true }),
    ];
    expect(mostRecentPassScaffolded(logs)).toBe(false);
  });

  it("treats a missing scaffolded flag as unscaffolded (false)", () => {
    expect(mostRecentPassScaffolded([log("2026-06-01T09:00:00Z")])).toBe(false);
  });

  it("ignores non-passing and non-free logs when finding the most recent pass", () => {
    const logs = [
      log("2026-06-04T09:00:00Z", { tier: "cued" }), // latest overall, but cued
      log("2026-06-03T09:00:00Z", { rating: "Again", scaffolded: false }), // latest free, but a fail
      log("2026-06-02T09:00:00Z", { scaffolded: true }), // latest passing free
    ];
    expect(mostRecentPassScaffolded(logs)).toBe(true);
  });

  it("returns false when there is no passing free production", () => {
    expect(mostRecentPassScaffolded([log("2026-06-01T09:00:00Z", { tier: "cued" })])).toBe(false);
  });
});
