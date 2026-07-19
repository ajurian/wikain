/**
 * SEED-14 over a real, migrated pglite database. Write-only store with one implementation (the
 * `review_batches` / heal-queue pattern), so its guarantees are asserted here directly rather than
 * through a shared contract file. Reads back through raw drizzle since the port itself is write-only.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { DrizzleSeedInstrumentation } from "./drizzleSeedInstrumentation.js";
import { makePgliteDb } from "../db/pglite.js";
import { seedEvents } from "../db/schema.js";
import { USER_A, USER_B } from "../testIds.js";

describe("DrizzleSeedInstrumentation (pglite)", () => {
  it("SEED-14: a granted seed persists its count and backlog state", async () => {
    const db = await makePgliteDb();
    const store = new DrizzleSeedInstrumentation(db);
    const at = new Date("2026-07-17T10:00:00.000Z");
    await store.recordGrant({ userId: USER_A, seededAt: at, count: 5, hadBacklog: true });

    const rows = await db.select().from(seedEvents).where(eq(seedEvents.userId, USER_A));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: USER_A,
      at,
      outcome: "granted",
      count: 5,
      hadBacklog: true,
      failingClause: null,
    });
  });

  it("SEED-14: a denied seed persists its failing clause and no grant fields", async () => {
    const db = await makePgliteDb();
    const store = new DrizzleSeedInstrumentation(db);
    const at = new Date("2026-07-18T00:00:00.000Z");
    await store.recordDenial({ userId: USER_A, at, failingClause: "min_gap" });

    const rows = await db.select().from(seedEvents).where(eq(seedEvents.userId, USER_A));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: USER_A,
      at,
      outcome: "denied",
      failingClause: "min_gap",
      count: null,
      hadBacklog: null,
    });
  });

  it("SEED-14: events are append-only — multiple writes accumulate, scoped per user", async () => {
    const db = await makePgliteDb();
    const store = new DrizzleSeedInstrumentation(db);
    await store.recordDenial({
      userId: USER_A,
      at: new Date("2026-07-17T12:00:00.000Z"),
      failingClause: "daily_cap",
    });
    await store.recordGrant({
      userId: USER_A,
      seededAt: new Date("2026-07-18T10:00:00.000Z"),
      count: 2,
      hadBacklog: false,
    });
    await store.recordDenial({
      userId: USER_B,
      at: new Date("2026-07-18T00:05:00.000Z"),
      failingClause: "min_gap",
    });

    const a = await db.select().from(seedEvents).where(eq(seedEvents.userId, USER_A));
    const b = await db.select().from(seedEvents).where(eq(seedEvents.userId, USER_B));
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(1);
  });
});
