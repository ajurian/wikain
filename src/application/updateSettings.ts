import { DAILY_GOAL_MAX, DAILY_GOAL_MIN } from "../domain/constants.js";
import type { UserSettings } from "../domain/settings.js";
import type { SettingsStore } from "./ports/settings.js";

export interface UpdateSettingsInput {
  userId: string;
  /** The fields the learner changed — an absent field is left untouched (merge, not replace). */
  patch: Partial<UserSettings>;
}

export interface UpdateSettingsDeps {
  settings: SettingsStore;
}

/**
 * Persist a learner's settings change (spec/10 CNT-8). A thin write over the store, with the one guard
 * the domain owns: `dailyGoal` must be a whole number in [DAILY_GOAL_MIN, DAILY_GOAL_MAX] — the same
 * bounds the `/settings` stepper clamps to, so a hand-crafted request can't persist an out-of-range
 * goal that the UI would then be unable to represent. Nothing else is validated (levelBand/timezone are
 * free-form for v1).
 */
export async function updateSettings(
  input: UpdateSettingsInput,
  deps: UpdateSettingsDeps,
): Promise<void> {
  const { dailyGoal } = input.patch;
  if (
    dailyGoal !== undefined &&
    (!Number.isInteger(dailyGoal) || dailyGoal < DAILY_GOAL_MIN || dailyGoal > DAILY_GOAL_MAX)
  ) {
    throw new RangeError(
      `dailyGoal must be an integer in [${DAILY_GOAL_MIN}, ${DAILY_GOAL_MAX}] (got ${dailyGoal})`,
    );
  }
  await deps.settings.write(input.userId, input.patch);
}
