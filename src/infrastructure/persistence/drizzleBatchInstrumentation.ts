/**
 * Drizzle-backed BatchInstrumentationStore (spec/14 BAT-16, STACK-3/6). Write-only from the
 * runtime (the heal-queue pattern) — rows are read offline for the amendment's hypothesis tests.
 *
 * The finalize idempotence lives in the SQL shape: `UPDATE … WHERE batch_id = ? AND outcome IS
 * NULL`. A second finalize (e.g. an expiry rebuild racing a completed seam) matches zero rows and
 * changes nothing — the first outcome stands.
 */
import { and, eq, isNull } from "drizzle-orm";
import type {
  BatchFinalization,
  BatchInstrumentationStore,
  PlannedBatchRow,
} from "~/application/ports/batchInstrumentation.js";
import type { DrizzleDb } from "./drizzleCardRepository.js";
import { reviewBatches } from "../db/schema.js";

export class DrizzleBatchInstrumentation implements BatchInstrumentationStore {
  constructor(private readonly db: DrizzleDb) {}

  async create(row: PlannedBatchRow): Promise<void> {
    await this.db.insert(reviewBatches).values(row);
  }

  async finalize(batchId: string, f: BatchFinalization): Promise<void> {
    await this.db
      .update(reviewBatches)
      .set({
        outcome: f.outcome,
        completedCount: f.completedCount,
        abandonedAtPosition: f.abandonedAtPosition ?? null,
        abandonedAtTier: f.abandonedAtTier ?? null,
        wallClockMs: f.wallClockMs,
        finalizedAt: f.finalizedAt,
      })
      .where(and(eq(reviewBatches.batchId, batchId), isNull(reviewBatches.outcome)));
  }

  async recordSeamChoice(batchId: string, continueChosen: boolean): Promise<void> {
    await this.db
      .update(reviewBatches)
      .set({ continueChosen })
      .where(eq(reviewBatches.batchId, batchId));
  }
}
