/**
 * Drizzle-backed SettingsStore (spec/10 CNT-8, STACK-3/6). The single persistence path (there is no
 * in-memory twin); the same adapter runs over pglite in tests and Neon in prod. All Drizzle/SQL stays
 * confined to this file + `db/schema.ts` (ARCH-1).
 *
 * `read` resolves defaults for an absent row (the port's contract). `write` merges the patch onto the
 * current (default-seeded) settings before the PK upsert, so a first partial write still persists a
 * complete NOT NULL row and a later patch never nulls an unset field.
 */
import { eq } from "drizzle-orm";
import type { SettingsStore } from "../application/ports/settings.js";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "../domain/settings.js";
import type { DrizzleDb } from "./drizzleCardRepository.js";
import { settings } from "./db/schema.js";

export class DrizzleSettings implements SettingsStore {
  constructor(private readonly db: DrizzleDb) {}

  async read(userId: string): Promise<UserSettings> {
    const rows = await this.db.select().from(settings).where(eq(settings.userId, userId));
    const row = rows[0];
    if (row === undefined) return { ...DEFAULT_USER_SETTINGS };
    return { dailyGoal: row.dailyGoal, timezone: row.timezone };
  }

  async write(userId: string, patch: Partial<UserSettings>): Promise<void> {
    const next: UserSettings = { ...(await this.read(userId)), ...patch };
    await this.db
      .insert(settings)
      .values({ userId, ...next })
      .onConflictDoUpdate({ target: settings.userId, set: next });
  }
}
