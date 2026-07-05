import type { UserSettings } from "../domain/settings.js";
import type { SettingsStore } from "./ports/settings.js";

export interface ReadSettingsInput {
  userId: string;
}

export interface ReadSettingsDeps {
  settings: SettingsStore;
}

/**
 * Read a learner's settings (spec/10 CNT-8). A thin read over the store — the store guarantees a
 * complete `UserSettings` (defaults filled), so this never handles a missing row. Kept as a use-case so
 * the presentation depends only on application (ARCH-1) and the read is substitutable like every other.
 */
export async function readSettings(
  input: ReadSettingsInput,
  deps: ReadSettingsDeps,
): Promise<UserSettings> {
  return deps.settings.read(input.userId);
}
