import { describe, it, expect } from "vitest";
import { evaluateSeedRail } from "./seedRail.js";
import { NEW_PER_DAY, SEED_MIN_GAP_HOURS } from "../constants.js";

const NOW = new Date("2026-07-19T12:00:00Z");
const HOUR = 3_600_000;

describe("evaluateSeedRail", () => {
  it("SEED-10: a first-ever seed (no ledger instant) is granted with the full daily cap", () => {
    const d = evaluateSeedRail({
      lastSeedAt: undefined,
      seededCount: 0,
      now: NOW,
      utcOffsetMinutes: 0,
    });
    expect(d.granted).toBe(true);
    expect(d.introducedToday).toBe(0);
    expect(d.dailyRemaining).toBe(NEW_PER_DAY);
    expect(d.failingClause).toBeUndefined();
  });

  it("SEED-10: a same-day rebuild with the cap already reached is denied on daily_cap", () => {
    // Earlier the SAME UTC day, well past the gap, but today's NEW_PER_DAY is spent.
    const lastSeedAt = new Date(NOW.getTime() - (SEED_MIN_GAP_HOURS + 1) * HOUR);
    const d = evaluateSeedRail({
      lastSeedAt,
      seededCount: NEW_PER_DAY,
      now: NOW,
      utcOffsetMinutes: 0,
    });
    expect(d.dailyRemaining).toBe(0);
    expect(d.granted).toBe(false);
    expect(d.failingClause).toBe("daily_cap");
  });

  it("SEED-10: a same-day partial-seed refill is granted immediately (no gap needed within a day)", () => {
    // Seeded 1 word 30 minutes ago (a backlog-throttled morning seed) — 4 of today's 5 remain.
    const lastSeedAt = new Date(NOW.getTime() - 30 * 60_000);
    const d = evaluateSeedRail({
      lastSeedAt,
      seededCount: 1,
      now: NOW,
      utcOffsetMinutes: 0,
    });
    expect(d.newCalendarDay).toBe(false);
    expect(d.gapElapsed).toBe(false); // gap NOT elapsed, yet within-day refill is still granted
    expect(d.introducedToday).toBe(1);
    expect(d.dailyRemaining).toBe(NEW_PER_DAY - 1);
    expect(d.granted).toBe(true);
  });

  it("SEED-10: the midnight double (new day, count reset, gap short) is denied on min_gap", () => {
    // Crossed midnight but only minutes ago → the day's count resets to 0 (headroom) yet the gap
    // clause blocks the boundary burst.
    const nowJustAfterMidnight = new Date("2026-07-20T00:05:00Z");
    const lastSeedAt = new Date("2026-07-19T23:55:00Z");
    const d = evaluateSeedRail({
      lastSeedAt,
      seededCount: NEW_PER_DAY, // yesterday's cap was full
      now: nowJustAfterMidnight,
      utcOffsetMinutes: 0,
    });
    expect(d.newCalendarDay).toBe(true);
    expect(d.gapElapsed).toBe(false);
    expect(d.introducedToday).toBe(0); // count reset by the new day
    expect(d.dailyRemaining).toBe(NEW_PER_DAY);
    expect(d.granted).toBe(false);
    expect(d.failingClause).toBe("min_gap");
  });

  it("SEED-10: a new calendar day past the gap resets the count and grants the full cap", () => {
    const lastSeedAt = new Date("2026-07-18T06:00:00Z"); // prior day, > gap, cap was full
    const d = evaluateSeedRail({
      lastSeedAt,
      seededCount: NEW_PER_DAY,
      now: NOW,
      utcOffsetMinutes: 0,
    });
    expect(d.introducedToday).toBe(0);
    expect(d.dailyRemaining).toBe(NEW_PER_DAY);
    expect(d.granted).toBe(true);
  });

  it("CNT-2: the calendar-day boundary honors the learner-local UTC offset", () => {
    // Same UTC calendar day, but the offset pushes `now` into the next local day → count resets.
    const lastSeedAt = new Date("2026-07-19T02:00:00Z");
    const now = new Date("2026-07-19T20:00:00Z");
    // +8h: lastSeedAt local = 07-19 10:00, now local = 07-20 04:00 → different local days.
    const d = evaluateSeedRail({
      lastSeedAt,
      seededCount: NEW_PER_DAY,
      now,
      utcOffsetMinutes: 8 * 60,
    });
    expect(d.newCalendarDay).toBe(true);
    expect(d.introducedToday).toBe(0);
    expect(d.granted).toBe(true);
  });
});
