/**
 * Coarse placement mapping (spec/09 SEED-2/SEED-3/SEED-5). One coarse self-report signal (or, later, a
 * LexTALE scalar) sets WHERE the frequency-band frontier sits — mechanism (i) of SEED-2. It never marks
 * individual words known and never selects the words themselves (SEED-3): the list stack picks the
 * actual words at the returned band. Kept pure + in the domain so the presentation never hardcodes the
 * spec's band policy.
 */

/** The three coarse self-report levels the onboarding level step offers (low-friction; FSRS self-corrects). */
export type CoarseLevel = "b1" | "b2" | "c1";

/**
 * Map a coarse level to a catalog frontier band string. B2 is the PH default productive frontier
 * (SEED-5: high receptive proficiency → ~B2 + NAWL, not the NGSL core); the "manage / comfortable /
 * polish" self-report nudges one band either way. The list stack (WordSource) then selects the actual
 * words at this band (SEED-3) — this function only decides the band, never the words.
 */
export function frontierBandForCoarseLevel(level: CoarseLevel): string {
  switch (level) {
    case "b1":
      return "B1";
    case "b2":
      return "B2";
    case "c1":
      return "C1";
  }
}
