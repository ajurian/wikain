import type { UserSettings } from "~/domain/settings.js";

/**
 * The per-user settings store (spec/10 CNT-8, ARCH-3). Narrow by intent (SOLID-4): the dashboard +
 * `/settings` read the whole object; `/settings` writes a partial patch. Scoped by `userId` — a setting
 * is never shared across accounts (multi-tenant, like the card repo).
 *
 * `read` always resolves a COMPLETE `UserSettings`, filling absent fields from `DEFAULT_USER_SETTINGS`,
 * so a consumer never sees a missing row. `write` merges the patch onto the current (default-seeded)
 * settings and upserts.
 */
export interface SettingsStore {
  read(userId: string): Promise<UserSettings>;
  write(userId: string, patch: Partial<UserSettings>): Promise<void>;
}
