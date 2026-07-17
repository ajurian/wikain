/**
 * Motion tokens (design-system §06). Durations in seconds — `motion/react` takes seconds, the
 * design system states milliseconds.
 *
 * These exist as constants because the values were previously literals at ~20 call sites, and the
 * easing curve had already drifted: most sites passed a duration with no `ease` and silently fell
 * back to the library default.
 */

export const DURATION = {
  /** hovers, chips, popovers, bounce fade */
  fast: 0.15,
  /** card enter, verdict reveal */
  base: 0.25,
  /** counter numeral, gauge fill */
  slow: 0.6,
} as const;

/** The one easing curve; no spring/bounce on outcomes — color carries meaning, not movement. */
export const EASE = [0.25, 0.1, 0.25, 1] as const;

/** Inline edits stagger this far apart, opacity-only (EDIT-7). */
export const EDIT_STAGGER = 0.04;
