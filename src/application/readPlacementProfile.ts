import type { PlacementProfile } from "../domain/placement/placementProfile.js";
import type { PlacementProfileStore } from "./ports/placementProfile.js";

export interface ReadPlacementProfileInput {
  userId: string;
}

export interface ReadPlacementProfileDeps {
  profile: PlacementProfileStore;
}

/**
 * Read a learner's placement profile (spec/09 SEED-2). A thin read over the store — the store guarantees a
 * complete `PlacementProfile` (defaults filled), so this never handles a missing row. Kept as a use-case so
 * the presentation depends only on application (ARCH-1); mirrors `readSettings`.
 */
export async function readPlacementProfile(
  input: ReadPlacementProfileInput,
  deps: ReadPlacementProfileDeps,
): Promise<PlacementProfile> {
  return deps.profile.read(input.userId);
}
