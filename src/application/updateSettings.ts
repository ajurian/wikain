import { DAILY_GOAL_MAX, DAILY_GOAL_MIN } from "~/domain/constants.js";
import type { UserSettings } from "~/domain/settings.js";
import { isValidTimeZone } from "~/domain/timezone.js";
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
 * goal that the UI would then be unable to represent. `timezone`, when present, must be a real IANA
 * zone (SM-5b/CNT-2 anchor the calendar-day boundary to it — a junk zone would silently corrupt every
 * day-bucket) — see `isValidTimeZone`.
 */
export async function updateSettings(
  input: UpdateSettingsInput,
  deps: UpdateSettingsDeps,
): Promise<void> {
  const { dailyGoal, timezone } = input.patch;
  if (
    dailyGoal !== undefined &&
    (!Number.isInteger(dailyGoal) || dailyGoal < DAILY_GOAL_MIN || dailyGoal > DAILY_GOAL_MAX)
  ) {
    throw new RangeError(
      `dailyGoal must be an integer in [${DAILY_GOAL_MIN}, ${DAILY_GOAL_MAX}] (got ${dailyGoal})`,
    );
  }
  if (timezone !== undefined && !isValidTimeZone(timezone)) {
    throw new RangeError(`timezone must be a valid IANA zone (got ${JSON.stringify(timezone)})`);
  }
  await deps.settings.write(input.userId, input.patch);
}
