import { NEW_PER_DAY, SEED_MIN_GAP_HOURS } from "../constants.js";
import { localDayKey } from "../mastery/judgedPassLedger.js";

export interface SeedRailInput {
  /** When introduction seeding last ran for this learner, or undefined if it never has. */
  lastSeedAt: Date | undefined;
  /** SEED-11: cumulative introductions stamped at `lastSeedAt` (ignored once a new local day rolls). */
  seededCount: number;
  now: Date;
  /** The learner-local UTC offset for the calendar-day boundary (CNT-2), resolved at the edge. */
  utcOffsetMinutes: number;
}

/**
 * The SEED-10 seed-rail decision. All the intermediate facts are surfaced (not just `granted`) so a
 * caller can (a) cap the seeder at `dailyRemaining` and (b) attribute a denial to the failing clause
 * (SEED-14: `daily_cap` vs `min_gap`).
 */
export interface SeedRailDecision {
  /** `last_seed_at` is a different learner-local calendar day than now (or there is no ledger row). */
  newCalendarDay: boolean;
  /** At least `SEED_MIN_GAP_HOURS` have elapsed since `last_seed_at` (trivially true if first-ever). */
  gapElapsed: boolean;
  /** Cumulative introductions already made in the current learner-local day (0 once the day rolls). */
  introducedToday: number;
  /** How many more introductions today's `NEW_PER_DAY` cap still permits (never negative). */
  dailyRemaining: number;
  /** SEED-10: a seed is granted iff there is daily headroom and — across a day boundary — the gap elapsed. */
  granted: boolean;
  /** SEED-14: which clause denied the seed. `undefined` when granted. */
  failingClause?: "daily_cap" | "min_gap";
}

/**
 * The pure SEED-10 / BAT-14 seed rail: whether steady-state introduction seeding may run now, and how
 * much. The per-learner-day `NEW_PER_DAY` **count cap** is the primary within-day bound (un-defers the
 * cap deferred in Amendment v4.2); the `SEED_MIN_GAP_HOURS` gap is retained purely as the
 * calendar-day-**boundary** guard — it blocks the 11:50pm→12:00am double that resets the day's count.
 * Within a single local day the cap alone bounds intros, so same-day refills up to the cap are
 * immediate (a partial or backlog-throttled morning seed no longer burns the day). A first-ever seed
 * (no ledger instant) trivially passes.
 *
 * Extracted from `buildSessionBatch` so the dashboard read-model can report the count the next build
 * would ACTUALLY seed (`dailyRemaining`-capped, 0 when the day is full or within the boundary gap)
 * without duplicating the rule — one source of truth for both the grader and the display (PRAG-3).
 */
export function evaluateSeedRail({
  lastSeedAt,
  seededCount,
  now,
  utcOffsetMinutes,
}: SeedRailInput): SeedRailDecision {
  const newCalendarDay =
    lastSeedAt === undefined ||
    localDayKey(lastSeedAt, utcOffsetMinutes) !==
      localDayKey(now, utcOffsetMinutes);
  const gapElapsed =
    lastSeedAt === undefined ||
    now.getTime() - lastSeedAt.getTime() >= SEED_MIN_GAP_HOURS * 3_600_000;

  const introducedToday = newCalendarDay ? 0 : seededCount;
  const dailyRemaining = Math.max(0, NEW_PER_DAY - introducedToday);

  // Within the day the cap is the whole guard; only crossing the boundary must clear the gap.
  const granted = dailyRemaining > 0 && (newCalendarDay ? gapElapsed : true);
  const failingClause = granted
    ? undefined
    : dailyRemaining <= 0
      ? ("daily_cap" as const)
      : ("min_gap" as const);

  return {
    newCalendarDay,
    gapElapsed,
    introducedToday,
    dailyRemaining,
    granted,
    failingClause,
  };
}
