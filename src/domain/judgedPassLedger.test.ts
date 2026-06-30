import { describe, it, expect } from "vitest";
import { distinctPassDays, mostRecentPassScaffolded } from "./judgedPassLedger.js";
import type { FsrsReviewLog, ReviewLog, ReviewTier } from "./review.js";
import type { Rating } from "./rating.js";

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
