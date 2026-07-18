/**
 * The per-user seeding ledger (spec/09 SEED-10/11, spec/14 BAT-14). Records the absolute instant
 * (`last_seed_at`) introduction seeding last ran for this user, so the seeding rail can grant a batch
 * only on a NEW learner-local calendar day AND at least `SEED_MIN_GAP_HOURS` after the previous seed.
 *
 * SEED-11: the value is an ABSOLUTE INSTANT, not a day key or a boolean. A day-key/boolean ("did
 * seeding run today?") cannot answer the min-gap clause (SEED-10b) — the instant answers both the
 * calendar-day boundary (a) and the elapsed-gap (b) comparisons.
 *
 * Deliberately NOT part of `SessionStateStore`: batch state is discardable presentation state (BAT-13
 * replaces it, Done clears it), while this is a pacing ledger fact that must survive both.
 */
export interface SeedLedgerStore {
  /** The instant seeding last ran for this user, or undefined if it never ran. */
  lastSeedAt(userId: string): Promise<Date | undefined>;
  /** Stamp that a seed batch ran at the given instant. Overwrites the previous instant. */
  recordSeedAt(userId: string, at: Date): Promise<void>;
}
