import type { Cefr } from "./lexicalItem.js";

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

/** A word with no CEFR (NAWL-only, DM-2) still carries a CEFR-like `band` label — read its level. */
const DEFAULT_BASE = CEFR_DIFFICULTY.B1;

function bandBaseDifficulty(band: string): number {
  // `band` is a CEFR-like label ("A1".."C1") or a hybrid span like "B2-C1"; key off the first token.
  const token = band.split("-")[0] as Exclude<Cefr, null>;
  return CEFR_DIFFICULTY[token] ?? DEFAULT_BASE;
}

const clamp = (n: number): number => Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, n));

/**
 * SEED-8: the FSRS cold-start difficulty estimate for a newly introduced card, derived from CEFR ×
 * frequency band. CEFR is the primary signal; `band` supplies the level when CEFR is null (NAWL) and
 * refines it for a level-spanning band (e.g. "B2-C1" nudges toward the harder end).
 *
 * This is a *starting estimate* only: ts-fsrs recomputes difficulty/stability from its own init
 * weights on the first graded review, so the seed governs the pre-first-review estimate (queue
 * ordering / display), not a permanent override. Target retention is `REQUEST_RETENTION`, applied as
 * engine config in the scheduler adapter — a separate axis of SEED-8, kept out of this pure policy.
 */
export function coldStartDifficulty(cefr: Cefr, band: string): number {
  const base = cefr !== null ? CEFR_DIFFICULTY[cefr] : bandBaseDifficulty(band);
  const spanBump = band.includes("-") ? 0.5 : 0;
  return clamp(base + spanBump);
}
