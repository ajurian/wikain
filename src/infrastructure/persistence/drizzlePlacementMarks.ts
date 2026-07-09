/**
 * Drizzle-backed PlacementMarksStore (spec/09 SEED-2/7, STACK-3/6). Written against the same
 * dialect-agnostic `DrizzleDb` handle as the card repository, so the SAME adapter runs over pglite in
 * tests and Neon in production — only `db` construction differs at the composition root.
 *
 * All Drizzle/SQL types stay confined to this file + `db/schema.ts` (ARCH-1). A mark is a bare
 * (user, sense) row; `record` upserts idempotently (`onConflictDoNothing`, SEED-2).
 */
import { eq } from "drizzle-orm";
import type { PlacementMarksStore } from "~/application/ports/placementMarks.js";
import type { DrizzleDb } from "./drizzleCardRepository.js";
import { placementMarks } from "../db/schema.js";

export class DrizzlePlacementMarks implements PlacementMarksStore {
  constructor(private readonly db: DrizzleDb) {}

  async record(userId: string, senseIds: readonly string[]): Promise<void> {
    if (senseIds.length === 0) return; // an empty insert is a SQL error; nothing to mark.
    await this.db
      .insert(placementMarks)
      .values(senseIds.map((senseId) => ({ userId, senseId })))
      .onConflictDoNothing();
  }

  async list(userId: string): Promise<string[]> {
    const rows = await this.db
      .select()
      .from(placementMarks)
      .where(eq(placementMarks.userId, userId));
    return rows.map((r) => r.senseId);
  }
}
