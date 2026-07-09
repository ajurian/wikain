/**
 * Drizzle-backed PlacementProfileStore (spec/09 SEED-1/2/4, STACK-3/6). The single persistence path (there
 * is no in-memory twin); the same adapter runs over pglite in tests and Neon in prod. All Drizzle/SQL stays
 * confined to this file + `db/schema.ts` (ARCH-1).
 *
 * `read` resolves defaults for an absent row (the port's contract). `write` merges the patch onto the
 * current (default-seeded) profile before the PK upsert, so a first partial write still persists a complete
 * NOT NULL `frontier_band` and a later patch never nulls an unset field.
 */
import { eq } from "drizzle-orm";
import type { PlacementProfileStore } from "../application/ports/placementProfile.js";
import {
  DEFAULT_PLACEMENT_PROFILE,
  type PlacementProfile,
} from "../domain/placement/placementProfile.js";
import type { DrizzleDb } from "./drizzleCardRepository.js";
import { placementProfile } from "./db/schema.js";

export class DrizzlePlacementProfile implements PlacementProfileStore {
  constructor(private readonly db: DrizzleDb) {}

  async read(userId: string): Promise<PlacementProfile> {
    const rows = await this.db
      .select()
      .from(placementProfile)
      .where(eq(placementProfile.userId, userId));
    const row = rows[0];
    if (row === undefined) return { ...DEFAULT_PLACEMENT_PROFILE };
    return {
      frontierBand: row.frontierBand,
      lextaleScore: row.lextaleScore,
      onboardedAt: row.onboardedAt,
    };
  }

  async write(userId: string, patch: Partial<PlacementProfile>): Promise<void> {
    const next: PlacementProfile = { ...(await this.read(userId)), ...patch };
    await this.db
      .insert(placementProfile)
      .values({ userId, ...next })
      .onConflictDoUpdate({ target: placementProfile.userId, set: next });
  }
}
