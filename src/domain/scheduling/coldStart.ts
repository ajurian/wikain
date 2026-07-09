import type { Cefr } from "../lexicalItem.js";

/** FSRS difficulty is bounded to [1, 10] (1 = easiest). */
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;

/**
 * A monotonic base difficulty per CEFR level, in the mid of FSRS's [1, 10] range: higher CEFR ⇒
 * harder ⇒ higher initial difficulty. Values are tunable policy, not a measured constant.
 */
const CEFR_DIFFICULTY: Record<Exclude<Cefr, null>, number> = {
  A1: 3,
  A2: 4,
  B1: 5,
  B2: 6,
  C1: 7,
};

/** Fallback base if an item ever carries a null CEFR (the catalog is A2–C1, so this is defensive). */
const DEFAULT_BASE = CEFR_DIFFICULTY.B1;

const clamp = (n: number): number => Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, n));

/**
 * SEED-8: the FSRS cold-start difficulty estimate for a newly introduced card, derived from CEFR
 * (every catalog item carries a real A2–C1 level — DM-2).
 *
 * This is a *starting estimate* only: ts-fsrs recomputes difficulty/stability from its own init
 * weights on the first graded review, so the seed governs the pre-first-review estimate (queue
 * ordering / display), not a permanent override. Target retention is `REQUEST_RETENTION`, applied as
 * engine config in the scheduler adapter — a separate axis of SEED-8, kept out of this pure policy.
 */
export function coldStartDifficulty(cefr: Cefr): number {
  const base = cefr !== null ? CEFR_DIFFICULTY[cefr] : DEFAULT_BASE;
  return clamp(base);
}
