/**
 * A Map-backed `PlacementProfileStore` double, shared by the three placement-profile use-case tests. The
 * persistence contract is covered by `placementProfileContract.ts` over the real adapter; this exists only
 * so a use-case test can assert the exact patch it emitted (`patches`) — which is how SEED-3's "writes
 * nothing else" is checked. Test-only; not imported by production code (cf. `fakeJudge.ts`).
 */
import {
  DEFAULT_PLACEMENT_PROFILE,
  type PlacementProfile,
} from "~/domain/placement/placementProfile.js";
import type { PlacementProfileStore } from "../ports/placementProfile.js";

export function fakePlacementProfileStore(): {
  profile: PlacementProfileStore;
  patches: Partial<PlacementProfile>[];
} {
  const rows = new Map<string, PlacementProfile>();
  const patches: Partial<PlacementProfile>[] = [];
  return {
    patches,
    profile: {
      async read(userId) {
        return { ...DEFAULT_PLACEMENT_PROFILE, ...rows.get(userId) };
      },
      async write(userId, patch) {
        patches.push(patch);
        rows.set(userId, { ...DEFAULT_PLACEMENT_PROFILE, ...rows.get(userId), ...patch });
      },
    },
  };
}
