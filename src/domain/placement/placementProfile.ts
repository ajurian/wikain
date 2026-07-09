import { DEFAULT_FRONTIER_BAND } from "../constants.js";

/**
 * What onboarding *persists* about a learner's placement (spec/09 SEED-1/2/4). A pure value object: the
 * store holds it, onboarding writes it, `startSession` reads the band from it, `/settings` displays it.
 *
 * Kept apart from `UserSettings` on purpose (SOLID-1 / CMP-2): settings answer to the learner adjusting a
 * preference; this answers to the placement/onboarding flow. Keeping `onboardedAt` out of the settings
 * merge-patch also keeps a lifecycle gate off a client-writable surface.
 *
 * Every field has a coherent default (`DEFAULT_PLACEMENT_PROFILE`), so a brand-new user with no persisted
 * row still resolves a complete profile — consumers never handle a missing row.
 */
export interface PlacementProfile {
  /** SEED-2 mechanism (i): WHERE the frequency-band frontier sits. Never marks or selects words (SEED-3). */
  frontierBand: string;
  /** SEED-4: the LexTALE averaged-%-correct scalar. `null` = the (optional) instrument was never taken. */
  lextaleScore: number | null;
  /** When the learner finished onboarding. `null` = not yet — the one thing the route gate reads. */
  onboardedAt: Date | null;
}

/** The profile a user has before onboarding writes anything: the SEED-5 default band, nothing else. */
export const DEFAULT_PLACEMENT_PROFILE: PlacementProfile = {
  frontierBand: DEFAULT_FRONTIER_BAND,
  lextaleScore: null,
  onboardedAt: null,
};
