import { createServerFn } from "@tanstack/react-start";
import { readSettings } from "../../application/readSettings.js";
import { updateSettings } from "../../application/updateSettings.js";
import type { UserSettings } from "../../domain/settings.js";
import { currentUserId } from "./currentUser.js";
import { settingsDeps } from "./composition.js";

/**
 * Read the current learner's settings (spec/10 CNT-8) — the adjustable daily goal + timezone. The store
 * guarantees a complete `UserSettings` (defaults filled), so this never returns a partial. `userId` is
 * resolved server-side (never trusted from the client). The level band is NOT here: it is placement state
 * (spec/09 SEED-2), read via `readPlacementProfileFn`.
 */
export const readSettingsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<UserSettings> => readSettings({ userId: await currentUserId() }, settingsDeps()),
);

/**
 * Persist a settings change (spec/10 CNT-8). A merge patch: an absent field is left untouched. The
 * `dailyGoal` bound [DAILY_GOAL_MIN, DAILY_GOAL_MAX] is enforced in the use-case, so a hand-crafted
 * request cannot store an out-of-range goal. POST (a write); `userId` is resolved server-side.
 */
export const updateSettingsFn = createServerFn({ method: "POST" })
  .validator((input: unknown): Partial<UserSettings> => {
    const o = input as Partial<UserSettings> | null;
    if (!o || typeof o !== "object") {
      throw new Error("updateSettingsFn: a settings patch object is required");
    }
    const patch: Partial<UserSettings> = {};
    if (o.dailyGoal !== undefined) {
      if (typeof o.dailyGoal !== "number") throw new Error("updateSettingsFn: dailyGoal must be a number");
      patch.dailyGoal = o.dailyGoal;
    }
    if (o.timezone !== undefined) {
      if (typeof o.timezone !== "string") throw new Error("updateSettingsFn: timezone must be a string");
      patch.timezone = o.timezone;
    }
    return patch;
  })
  .handler(async ({ data }): Promise<void> => {
    await updateSettings({ userId: await currentUserId(), patch: data }, settingsDeps());
  });
