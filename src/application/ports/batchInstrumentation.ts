import type { ReviewTier } from "~/domain/review/review.js";

/**
 * Per-batch analytics (spec/14 BAT-16) — instrumented from day one because it cannot be
 * retrofitted. Write-only from the runtime's perspective (the heal-queue pattern): rows are
 * read offline for the amendment's hypothesis tests (Continue-rate, abandonment position, …).
 */
export interface PlannedBatchRow {
  batchId: string;
  userId: string;
  batchNumber: number;
  plannedTierCounts: Record<ReviewTier, number>;
  plannedUnits: number;
  plannedCards: number;
  builtAt: Date;
}

export interface BatchFinalization {
  outcome: "completed" | "abandoned";
  /** Logged-rating count when the batch ended (equals plannedCards − shrinks when completed). */
  completedCount: number;
  /** BAT-16: where an abandoned batch stalled — the index and tier of the card that was up next. */
  abandonedAtPosition?: number;
  abandonedAtTier?: ReviewTier;
  wallClockMs: number;
  finalizedAt: Date;
}

export interface BatchInstrumentationStore {
  create(row: PlannedBatchRow): Promise<void>;
  /** Idempotent: a batch finalizes once; a second call must not overwrite the first outcome. */
  finalize(batchId: string, finalization: BatchFinalization): Promise<void>;
  /** BAT-9: the explicit seam choice, recorded after a `completed` finalization. */
  recordSeamChoice(batchId: string, continueChosen: boolean): Promise<void>;
}
