import { describe, it, expect } from "vitest";
import { evaluateSeedRail } from "./seedRail.js";
import { SEED_MIN_GAP_HOURS } from "../constants.js";

const NOW = new Date("2026-07-19T12:00:00Z");
const HOUR = 3_600_000;

describe("evaluateSeedRail", () => {
  it("SEED-10: a first-ever seed (no ledger instant) is granted", () => {
    const d = evaluateSeedRail({ lastSeedAt: undefined, now: NOW, utcOffsetMinutes: 0 });
    expect(d).toEqual({ newCalendarDay: true, gapElapsed: true, granted: true });
  });

  it("SEED-10: a same-day seed is denied on the calendar-day clause", () => {
    // Earlier the SAME UTC day, and well past the min gap — only the day clause fails.
    const lastSeedAt = new Date(NOW.getTime() - (SEED_MIN_GAP_HOURS + 1) * HOUR);
    const d = evaluateSeedRail({ lastSeedAt, now: NOW, utcOffsetMinutes: 0 });
    expect(d.newCalendarDay).toBe(false);
    expect(d.granted).toBe(false);
  });

  it("BAT-14: a new calendar day within the min gap is denied on the gap clause", () => {
    // Crossed midnight but only a few minutes ago → new day, gap NOT elapsed.
    const nowJustAfterMidnight = new Date("2026-07-20T00:05:00Z");
    const lastSeedAt = new Date("2026-07-19T23:55:00Z");
    const d = evaluateSeedRail({ lastSeedAt, now: nowJustAfterMidnight, utcOffsetMinutes: 0 });
    expect(d.newCalendarDay).toBe(true);
    expect(d.gapElapsed).toBe(false);
    expect(d.granted).toBe(false);
  });

  it("SEED-10: a new calendar day past the min gap is granted", () => {
    const lastSeedAt = new Date("2026-07-18T06:00:00Z"); // prior day, > 5h ago
    const d = evaluateSeedRail({ lastSeedAt, now: NOW, utcOffsetMinutes: 0 });
    expect(d).toEqual({ newCalendarDay: true, gapElapsed: true, granted: true });
  });

  it("CNT-2: the calendar-day boundary honors the learner-local UTC offset", () => {
    // Same UTC calendar day, but the offset pushes `now` into the next local day.
    const lastSeedAt = new Date("2026-07-19T02:00:00Z");
    const now = new Date("2026-07-19T20:00:00Z");
    // +8h: lastSeedAt local = 07-19 10:00, now local = 07-20 04:00 → different local days.
    const d = evaluateSeedRail({ lastSeedAt, now, utcOffsetMinutes: 8 * 60 });
    expect(d.newCalendarDay).toBe(true);
    expect(d.granted).toBe(true);
  });
});
