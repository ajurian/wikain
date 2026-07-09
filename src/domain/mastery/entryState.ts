import type { MasteryState } from "./card.js";

/**
 * SEED-2 / SM-11: the mastery state a newly introduced word enters. A per-word placement-known flag
 * is the ONLY thing that skips `Seen` — the word is instantiated directly into `Recognized` (it still
 * owes one cued pass to reach `Productive`, SM-4/INV-4). Every other word enters at `Seen` and walks
 * the two-step on-ramp (SM-3).
 *
 * The frontier band (a LexTALE-scalar-derived value) is deliberately NOT a parameter here: SEED-3
 * forbids the scalar from marking words known, so skip-`Seen` keys off the per-word flag alone. Keep
 * this pure and flag-only so that separation is enforced by the type surface.
 */
export function introductionState(placementKnown: boolean): MasteryState {
  return placementKnown ? "Recognized" : "Seen";
}
