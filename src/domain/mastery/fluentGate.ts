import { FLUENT_JUDGED_PASSES, FLUENT_MIN_STABILITY_DAYS } from "../constants.js";

/** The SM-5 inputs, pre-reduced from the judged-pass ledger + FSRS state. */
export interface FluentGateInput {
  /** SM-5(a/b): distinct calendar days with a passing free judged production (judgedPassLedger). */
  passDays: number;
  /** SM-5(c): current FSRS stability in days (Card.fsrs.stability). */
  stability: number;
  /** SM-5(d): whether the most recent passing free production was scaffolded (SM-9). */
  mostRecentScaffolded: boolean;
}

/**
 * SM-5: `Productive → Fluent` requires the **conjunction** of (a) FLUENT_JUDGED_PASSES spaced judged
 * passes, (b) on separate calendar days — both encoded in `passDays` — (c) FSRS stability ≥
 * FLUENT_MIN_STABILITY_DAYS, and (d) an unscaffolded most-recent pass. Cued/recognition/cloze passes
 * never reach `passDays` (INV-4, filtered in the ledger).
 */
export function qualifiesForFluent(input: FluentGateInput): boolean {
  return (
    input.passDays >= FLUENT_JUDGED_PASSES &&
    input.stability >= FLUENT_MIN_STABILITY_DAYS &&
    !input.mostRecentScaffolded
  );
}
