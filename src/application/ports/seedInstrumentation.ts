/**
 * Seeding-rail instrumentation (spec/09 SEED-14) — instrumented from day one because it cannot be
 * retrofitted (the SEED-10 rail's whole justification is a rate claim only the log can confirm).
 * Write-only from the runtime's perspective (the `review_batches` / heal-queue pattern): rows are read
 * offline to (i) tune `SEED_MIN_GAP_HOURS` and (ii) confirm the rail rarely binds — frequent binding
 * points at the §8 backlog gate or pace, not this rail.
 */

/**
 * Which clause of the SEED-10 rail denied a seed. Precedence is deliberate: `"calendar_day"` whenever
 * the same-day clause failed (the ordinary, expected denial — a same-local-day rebuild), and
 * `"min_gap"` ONLY when the calendar day rolled but the gap had not yet elapsed. So a
 * `failing_clause = 'min_gap'` row is exactly a boundary-burst (e.g. 11:50pm→12:00am) the new gap
 * clause caught — the signal the amendment exists to produce (SEED-14 purpose ii).
 */
export type SeedDenialClause = "calendar_day" | "min_gap";

export interface GrantedSeedEvent {
  userId: string;
  /** The stamped instant — equals the ledger's new `last_seed_at`. */
  seededAt: Date;
  /** Number of introductions the pacing math admitted (may be 0 — the pass still ran and stamped). */
  count: number;
  /** Backlog state at grant: whether any already-existing due card was in the ordered queue. */
  hadBacklog: boolean;
}

export interface DeniedSeedEvent {
  userId: string;
  at: Date;
  failingClause: SeedDenialClause;
}

export interface SeedInstrumentationStore {
  recordGrant(event: GrantedSeedEvent): Promise<void>;
  recordDenial(event: DeniedSeedEvent): Promise<void>;
}
