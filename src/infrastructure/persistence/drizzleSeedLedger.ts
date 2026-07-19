/**
 * Drizzle-backed SeedLedgerStore (spec/09 SEED-10/11, STACK-3/6). One row per user holding the absolute
 * instant seeding last ran on and the running per-learner-day introduction count stamped at it; the
 * upsert overwrites — only the latest instant + its day-count matter. Deliberately separate from
 * `session_state` so it survives the BAT-13 replacement and Done-clear.
 */
import { eq } from "drizzle-orm";
import type {
  SeedLedgerEntry,
  SeedLedgerStore,
} from "~/application/ports/seedLedger.js";
import type { DrizzleDb } from "./drizzleCardRepository.js";
import { seedLedger } from "../db/schema.js";

export class DrizzleSeedLedger implements SeedLedgerStore {
  constructor(private readonly db: DrizzleDb) {}

  async read(userId: string): Promise<SeedLedgerEntry | undefined> {
    const rows = await this.db
      .select()
      .from(seedLedger)
      .where(eq(seedLedger.userId, userId));
    const row = rows[0];
    if (row === undefined) return undefined;
    return { lastSeedAt: row.lastSeedAt, seededCount: row.seededCount };
  }

  async record(userId: string, at: Date, seededCount: number): Promise<void> {
    await this.db
      .insert(seedLedger)
      .values({ userId, lastSeedAt: at, seededCount })
      .onConflictDoUpdate({
        target: seedLedger.userId,
        set: { lastSeedAt: at, seededCount },
      });
  }
}
