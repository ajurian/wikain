/*
 * ============================================================================
 * MOCK DATA — design-time only. TO BE REPLACED.
 * ----------------------------------------------------------------------------
 * The learner's *identity* (name / email / level band / timezone) and the
 * shared MasteryState union. The per-word list, counter, ladder, and Today
 * counts are now WIRED (slices 14–16) — their mocks were retired. What remains
 * is the mock USER (BetterAuth-deferred, STACK-4) behind the /settings +
 * app-shell chrome; replace it when the auth adapter lands.
 * ============================================================================
 */

export type MasteryState = "New" | "Seen" | "Recognized" | "Productive" | "Fluent";

export const MOCK_LEARNER = {
  name: "Amihan",
  email: "amihan@example.com",
  /** CNT-8: learner-set, unit = productive uses (sentences) */
  dailyGoal: 5,
  levelBand: "B2 · upper-intermediate",
  timezone: "Asia/Manila",
};
