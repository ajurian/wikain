import { frontierBandForCoarseLevel, type CoarseLevel } from "../domain/placement/placement.js";
import type { PlacementProfileStore } from "./ports/placementProfile.js";

export interface RecordCoarseLevelInput {
  userId: string;
  /** The onboarding level step's self-report. Narrowed by `isCoarseLevel` at the server boundary. */
  level: CoarseLevel;
}

export interface RecordCoarseLevelDeps {
  profile: PlacementProfileStore;
}

/**
 * Persist the frontier band implied by the learner's coarse self-report (spec/09 SEED-2 mechanism (i)) and
 * return it, so the caller can seed at the same band without a second read. Used both by onboarding's level
 * step and by the `/placement` retune.
 *
 * Takes the `CoarseLevel`, not a band string: the band is spec policy (`frontierBandForCoarseLevel`), so a
 * client can never nominate an arbitrary frontier.
 *
 * Clears `lextaleScore`, because the scalar is only meaningful as the SOURCE of the current band (SEED-4):
 * a learner who scored 87.5% (⇒ C1) and then self-reports `b1` must not be shown "B1 — LexTALE 87.5%", a
 * band attributed to an instrument that did not produce it. In onboarding this is a no-op — the coarse level
 * is always recorded before LexTALE can run.
 *
 * Writes NOTHING else: SEED-3 forbids this mechanism from marking words known (that is
 * `PlacementMarksStore`) or selecting them (that is the `WordSource`), and the dep set carries neither. It
 * also leaves `onboardedAt` untouched, so a retune never re-opens onboarding.
 */
export async function recordCoarseLevel(
  input: RecordCoarseLevelInput,
  deps: RecordCoarseLevelDeps,
): Promise<string> {
  const frontierBand = frontierBandForCoarseLevel(input.level);
  await deps.profile.write(input.userId, { frontierBand, lextaleScore: null });
  return frontierBand;
}
