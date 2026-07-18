import { DAILY_GOAL_DEFAULT, THEME_DEFAULT } from "./constants.js";
import type { Theme } from "./theme.js";

/**
 * A learner's per-user preferences (spec/10 CNT-8). A pure value object: the store persists it, the
 * dashboard reads the goal, `/settings` edits it. Every field has a sensible default so a brand-new user
 * with no persisted row still resolves a coherent settings view (`DEFAULT_USER_SETTINGS`) — consumers
 * never handle a missing row.
 *
 * The learner's level band is NOT here: it is placement state, written by onboarding and read by the
 * seeder, and lives in `PlacementProfile` (spec/09 SEED-2). One source of truth for the band.
 */
export interface UserSettings {
  /** CNT-8: the daily USE goal, unit = free judged productions. Learner-adjustable (DAILY_GOAL_MIN..MAX). */
  dailyGoal: number;
  /** IANA timezone; the "separate calendar days" logic (SM-5b/CNT-2) is anchored to this clock. */
  timezone: string;
  /** UI theme preference; `system` follows the device's `prefers-color-scheme`. Presentation-only effect. */
  theme: Theme;
}

/** The settings a user has before persisting any preference. `timezone` = UTC to match the day-boundary
 * default the dashboard read-model uses (utcOffsetMinutes ?? 0) until a real tz is captured. */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  dailyGoal: DAILY_GOAL_DEFAULT,
  timezone: "UTC",
  theme: THEME_DEFAULT,
};
