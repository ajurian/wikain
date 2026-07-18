/**
 * BAT-16 over a real, migrated pglite database. The port is write-only with one implementation
 * (the heal-queue precedent — no shared contract file); assertions read the table directly.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { DrizzleBatchInstrumentation } from "./drizzleBatchInstrumentation.js";
import { makePgliteDb } from "../db/pglite.js";
import { reviewBatches } from "../db/schema.js";
import { USER_A } from "../testIds.js";
import type { PlannedBatchRow } from "~/application/ports/batchInstrumentation.js";

const BATCH_ID = "5f2b6a1c-9d3e-4f70-8a21-000000000010";

function planned(): PlannedBatchRow {
  return {
    batchId: BATCH_ID,
    userId: USER_A,
    batchNumber: 1,
    plannedTierCounts: { recognition: 2, cloze: 1, cued: 0, free: 1 },
    plannedUnits: 14,
    plannedCards: 4,
    builtAt: new Date("2026-07-17T10:00:00.000Z"),
  };
}

describe("DrizzleBatchInstrumentation (pglite)", () => {
  it("BAT-16: a created row holds the planned composition and stays open (outcome null)", async () => {
    const db = await makePgliteDb();
    const store = new DrizzleBatchInstrumentation(db);
    await store.create(planned());
    const [row] = await db.select().from(reviewBatches).where(eq(reviewBatches.batchId, BATCH_ID));
    expect(row!.plannedTierCounts).toEqual({ recognition: 2, cloze: 1, cued: 0, free: 1 });
    expect(row!.plannedUnits).toBe(14);
    expect(row!.outcome).toBeNull();
    expect(row!.continueChosen).toBeNull();
  });

  it("BAT-16: finalize records the outcome once — a second finalize cannot overwrite the first", async () => {
    const db = await makePgliteDb();
    const store = new DrizzleBatchInstrumentation(db);
    await store.create(planned());
    await store.finalize(BATCH_ID, {
      outcome: "abandoned",
      completedCount: 2,
      abandonedAtPosition: 2,
      abandonedAtTier: "free",
      wallClockMs: 300_000,
      finalizedAt: new Date("2026-07-17T10:30:00.000Z"),
    });
    await store.finalize(BATCH_ID, {
      outcome: "completed",
      completedCount: 4,
      wallClockMs: 999_999,
      finalizedAt: new Date("2026-07-17T11:00:00.000Z"),
    });
    const [row] = await db.select().from(reviewBatches).where(eq(reviewBatches.batchId, BATCH_ID));
    expect(row!.outcome).toBe("abandoned"); // the first finalization stands
    expect(row!.completedCount).toBe(2);
    expect(row!.abandonedAtPosition).toBe(2);
    expect(row!.abandonedAtTier).toBe("free");
    expect(row!.wallClockMs).toBe(300_000);
  });

  it("BAT-9/16: the seam choice lands on the (already completed) row", async () => {
    const db = await makePgliteDb();
    const store = new DrizzleBatchInstrumentation(db);
    await store.create(planned());
    await store.finalize(BATCH_ID, {
      outcome: "completed",
      completedCount: 4,
      wallClockMs: 200_000,
      finalizedAt: new Date("2026-07-17T10:10:00.000Z"),
    });
    await store.recordSeamChoice(BATCH_ID, true);
    const [row] = await db.select().from(reviewBatches).where(eq(reviewBatches.batchId, BATCH_ID));
    expect(row!.outcome).toBe("completed");
    expect(row!.continueChosen).toBe(true);
  });
});
