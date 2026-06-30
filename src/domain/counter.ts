import { COUNTER_MIN_SPACED_PASSES, COUNTER_R_FLOOR } from "./constants.js";

/** The CNT-2/CNT-3 inputs, pre-reduced per word at read time. */
export interface CounterMembershipInput {
  /** CNT-2: distinct calendar days with a passing free judged production (judgedPassLedger). */
  passDays: number;
  /** CNT-3: `get_retrievability(card, now)` evaluated live at read time. */
  retrievability: number;
}

/**
 * CNT-2 / CNT-3 / CNT-6: a word counts toward "words you can now use" when it has at least
 * COUNTER_MIN_SPACED_PASSES spaced judged passes (recognition/cloze/cued never count — INV-4, the
 * ledger filters them) AND its live retrievability is at or above COUNTER_R_FLOOR. The retrievability
 * gate is evaluated at read time (CNT-3/CNT-4) so the count honestly ticks down between reviews. The
 * threshold is lower than the Fluent gate (CNT-6) — a word is counted while merely Productive.
 */
export function isCounted(input: CounterMembershipInput): boolean {
  return input.passDays >= COUNTER_MIN_SPACED_PASSES && input.retrievability >= COUNTER_R_FLOOR;
}
