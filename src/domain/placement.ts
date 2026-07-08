/**
 * Coarse placement mapping (spec/09 SEED-2/SEED-3/SEED-5). Mechanism (i) of SEED-2: one signal — either
 * the low-friction coarse self-report or the LexTALE scalar (SEED-4) — sets WHERE the frequency-band
 * frontier sits. Neither marks individual words known, and neither selects the words themselves
 * (SEED-3): the list stack picks the actual words at the returned band. Kept pure + in the domain so the
 * presentation never hardcodes the spec's band policy.
 *
 * This file owns **band policy**; `lextale.ts` owns **the instrument** (its items and scoring). They meet
 * only at `frontierBandFromLexTale`, which takes a bare number.
 */
import { DEFAULT_FRONTIER_BAND } from "./constants.js";

/** The three coarse self-report levels the onboarding level step offers (low-friction; FSRS self-corrects). */
export type CoarseLevel = "b1" | "b2" | "c1";

const COARSE_LEVELS: readonly string[] = ["b1", "b2", "c1"];

/** Narrow an untrusted value to a `CoarseLevel` — the server validator's guard against a forged band. */
export function isCoarseLevel(value: unknown): value is CoarseLevel {
  return typeof value === "string" && COARSE_LEVELS.includes(value);
}

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
      return DEFAULT_FRONTIER_BAND;
    case "c1":
      return "C1";
  }
}

/**
 * The inverse of `frontierBandForCoarseLevel`: which coarse self-report would produce this band, if any.
 * `null` when no level maps to it — a band set by LexTALE is still one of the three, but a future band
 * (or a corrupt row) is not, and the `/placement` retune form must then pre-select nothing rather than
 * imply a self-report the learner never made.
 */
export function coarseLevelForBand(band: string): CoarseLevel | null {
  return (
    (COARSE_LEVELS as CoarseLevel[]).find((level) => frontierBandForCoarseLevel(level) === band) ??
    null
  );
}

/**
 * SEED-2 mechanism (i) via SEED-4: map the LexTALE averaged-%-correct scalar onto a catalog frontier
 * band. Cutoffs are the instrument's own (Lemhöfer & Broersma 2012, Table 9): C1–C2 = 80–100,
 * B2 = 60–80, "B1 and below" = <59.
 *
 * That published table leaves 59–60 unassigned and claims 80 twice, so we resolve both boundaries
 * downward-exclusive: `>= 80 → C1`, `>= 60 → B2`, else `B1`. Placement is low-stakes (SEED-4: FSRS
 * re-estimates within a few sessions), so a boundary learner losing a band is self-correcting.
 *
 * The scalar's OTHER published output — FSRS cold-start difficulty (SEED-2 mechanism (i), second column)
 * — is deliberately NOT wired here; see `coldStart.ts`, which still keys off the item's own CEFR. That
 * half of SEED-2 stays deferred alongside SEED-8's per-user optimization (PRAG-1).
 */
export function frontierBandFromLexTale(score: number): string {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new RangeError(`frontierBandFromLexTale: score must be in [0, 100] (got ${score})`);
  }
  if (score >= 80) return "C1";
  if (score >= 60) return DEFAULT_FRONTIER_BAND;
  return "B1";
}
