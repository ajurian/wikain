import type { BatchQueueEntry } from "~/domain/scheduling/batch.js";

/**
 * The server-persisted presentation state of a user's active mini-session batch (spec/14 BAT-11).
 * This is the ONLY state batching owns: ratings/scheduling/mastery live entirely in the review
 * path (BAT-1). Discardable by definition — BAT-13 replaces it wholesale on expiry, and Done
 * clears it; anything that must outlive that (the seeding day key) lives elsewhere (`SeedLedger`).
 */
export interface ActiveSessionState {
  userId: string;
  /** The `review_batches` instrumentation row this batch reports to (BAT-16). */
  batchId: string;
  /** Ordinal of this batch within the session, 1-based (BAT-16). */
  batchNumber: number;
  /** The active batch, immutable except the BAT-8 shrink. `entries[progressIndex]` is the card up next. */
  entries: BatchQueueEntry[];
  /** Logged-rating count = the bar's numerator (BAT-7). `=== entries.length` means at the seam. */
  progressIndex: number;
  startedAt: Date;
  /** BAT-11: absence is measured from here; every review interaction refreshes it (BAT-7). */
  lastInteractionAt: Date;
}

/** One active batch per user — `save` replaces wholesale (the state is small and self-contained). */
export interface SessionStateStore {
  load(userId: string): Promise<ActiveSessionState | undefined>;
  save(state: ActiveSessionState): Promise<void>;
  /** BAT-9: Done at the seam ends the session; there is simply no active batch afterwards. */
  clear(userId: string): Promise<void>;
}
