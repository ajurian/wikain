/**
 * Drizzle-backed SeedLedgerStore (spec/09 SEED-10/11, STACK-3/6). One row per user holding the absolute
 * instant seeding last ran on; the upsert overwrites — only the latest instant matters. Deliberately
 * separate from `session_state` so it survives the BAT-13 replacement and Done-clear.
 */
import { eq } from "drizzle-orm";
import type { SeedLedgerStore } from "~/application/ports/seedLedger.js";
import type { DrizzleDb } from "./drizzleCardRepository.js";
import { seedLedger } from "../db/schema.js";

export class DrizzleSeedLedger implements SeedLedgerStore {
  constructor(private readonly db: DrizzleDb) {}

  async lastSeedAt(userId: string): Promise<Date | undefined> {
    const rows = await this.db
      .select()
      .from(seedLedger)
      .where(eq(seedLedger.userId, userId));
    return rows[0]?.lastSeedAt;
  }

  async recordSeedAt(userId: string, at: Date): Promise<void> {
    await this.db
      .insert(seedLedger)
      .values({ userId, lastSeedAt: at })
      .onConflictDoUpdate({
        target: seedLedger.userId,
        set: { lastSeedAt: at },
      });
  }
}
