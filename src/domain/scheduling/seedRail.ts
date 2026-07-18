import { SEED_MIN_GAP_HOURS } from "../constants.js";
import { localDayKey } from "../mastery/judgedPassLedger.js";

export interface SeedRailInput {
  /** When introduction seeding last ran for this learner, or undefined if it never has. */
  lastSeedAt: Date | undefined;
  now: Date;
  /** The learner-local UTC offset for the calendar-day boundary (CNT-2), resolved at the edge. */
  utcOffsetMinutes: number;
}

/**
 * The two SEED-10 clauses plus their conjunction. Both clauses are surfaced (not just `granted`) so a
 * caller can attribute a denial to the failing clause (SEED-14: `min_gap` vs `calendar_day`).
 */
export interface SeedRailDecision {
  /** (a) `last_seed_at` is a different learner-local calendar day than now. */
  newCalendarDay: boolean;
  /** (b) at least `SEED_MIN_GAP_HOURS` have elapsed since `last_seed_at`. */
  gapElapsed: boolean;
  /** SEED-10: a seed batch is granted iff BOTH clauses hold. */
  granted: boolean;
}

/**
 * The pure SEED-10 / BAT-14 seed rail: whether steady-state introduction seeding may run now. A seed
 * is granted iff BOTH a new learner-local calendar day has rolled since the last seed AND at least
 * `SEED_MIN_GAP_HOURS` have elapsed — the gap clause is what blocks the 11:50pm→12:00am boundary-burst
 * the calendar-day clause alone permits. A first-ever seed (no ledger instant) trivially passes both.
 *
 * Extracted from `buildSessionBatch` so the dashboard read-model can report the count the next build
 * would ACTUALLY seed (0 when the rail is closed today) without duplicating the rule — one source of
 * truth for both the grader and the display (PRAG-3).
 */
export function evaluateSeedRail({
  lastSeedAt,
  now,
  utcOffsetMinutes,
}: SeedRailInput): SeedRailDecision {
  const newCalendarDay =
    lastSeedAt === undefined ||
    localDayKey(lastSeedAt, utcOffsetMinutes) !== localDayKey(now, utcOffsetMinutes);
  const gapElapsed =
    lastSeedAt === undefined ||
    now.getTime() - lastSeedAt.getTime() >= SEED_MIN_GAP_HOURS * 3_600_000;
  return { newCalendarDay, gapElapsed, granted: newCalendarDay && gapElapsed };
}
