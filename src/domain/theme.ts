/**
 * Theme preference (light / dark / system). Pure — a closed set of string literals with a runtime
 * guard, no I/O, so it stays in the domain (ARCH-1). `system` defers to the OS/browser
 * `prefers-color-scheme`; it is resolved to an effective light/dark only in presentation, never here.
 * Mirrors `timezone.ts`: the store persists the value, `/settings` edits it, `updateSettings` guards it.
 */

/** The three theme choices a learner can persist. `system` follows the device's color-scheme. */
export type Theme = "light" | "dark" | "system";

/** The valid values, as data — the single source shared by the guard and the `/settings` control. */
export const THEME_VALUES = ["light", "dark", "system"] as const;

/** True if `x` is one of the three persistable theme choices. */
export function isValidTheme(x: unknown): x is Theme {
  return typeof x === "string" && (THEME_VALUES as readonly string[]).includes(x);
}
