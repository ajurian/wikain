import { describe, expect, it } from "vitest";
import { completeOnboarding } from "./completeOnboarding.js";
import { readPlacementProfile } from "./readPlacementProfile.js";
import { fakePlacementProfileStore } from "./placementProfileTestDouble.js";

const USER = "u1";

describe("completeOnboarding (SEED-1)", () => {
  it("SEED-1: stamps onboardedAt — the one write the route gate reads", async () => {
    const { profile, patches } = fakePlacementProfileStore();
    const now = new Date("2026-07-08T09:00:00Z");
    await completeOnboarding({ userId: USER, now }, { profile });
    expect((await readPlacementProfile({ userId: USER }, { profile })).onboardedAt).toEqual(now);
    expect(patches).toEqual([{ onboardedAt: now }]);
  });

  it("SEED-1: is idempotent — a re-run keeps the ORIGINAL completion instant and writes nothing", async () => {
    const { profile, patches } = fakePlacementProfileStore();
    const first = new Date("2026-07-08T09:00:00Z");
    await completeOnboarding({ userId: USER, now: first }, { profile });
    await completeOnboarding({ userId: USER, now: new Date("2026-07-09T09:00:00Z") }, { profile });
    expect((await readPlacementProfile({ userId: USER }, { profile })).onboardedAt).toEqual(first);
    expect(patches).toHaveLength(1);
  });
});
