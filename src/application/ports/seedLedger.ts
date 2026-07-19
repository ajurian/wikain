/**
 * The per-user seeding ledger (spec/09 SEED-10/11, spec/14 BAT-14). Records the absolute instant
 * (`lastSeedAt`) introduction seeding last ran on AND the running per-learner-day count (`seededCount`)
 * stamped at that instant, so the seeding rail can enforce both clauses of SEED-10: the `NEW_PER_DAY`
 * per-day count cap (the within-day bound) and the `SEED_MIN_GAP_HOURS` calendar-day-boundary gap.
 *
 * SEED-11: `lastSeedAt` is an ABSOLUTE INSTANT, not a day key or boolean — the instant answers both the
 * calendar-day boundary and the elapsed-gap comparisons. `seededCount` is interpreted relative to
 * `lastSeedAt`'s local day: once a new learner-local day rolls, the cap resets (the count is stale).
 * The ledger advances ONLY when at least one card is actually introduced (a zero-intro pass is a
 * no-op, so a backlog-throttled or frontier-exhausted moment never burns the day).
 *
 * Deliberately NOT part of `SessionStateStore`: batch state is discardable presentation state (BAT-13
 * replaces it, Done clears it), while this is a pacing ledger fact that must survive both.
 */
export interface SeedLedgerEntry {
  /** The instant seeding last ran for this user. */
  lastSeedAt: Date;
  /** Cumulative introductions stamped at `lastSeedAt` (relative to that instant's learner-local day). */
  seededCount: number;
}

export interface SeedLedgerStore {
  /** The last seed instant + its day's running count, or undefined if seeding never ran. */
  read(userId: string): Promise<SeedLedgerEntry | undefined>;
  /** Stamp that a seed of `seededCount` cumulative day-introductions ran at `at`. Overwrites the row. */
  record(userId: string, at: Date, seededCount: number): Promise<void>;
}
