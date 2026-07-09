/**
 * Shared PlacementProfileStore conformance suite (spec/09 SEED-1/2/4). Every implementation MUST pass
 * identically — the executable statement of Liskov substitutability (SOLID-3). With the in-memory adapters
 * removed, the sole implementation is `DrizzlePlacementProfile`, run here over pglite; the suite stays a
 * shared contract so a second adapter would be held to the same behavior. Not a `*.test.ts` itself.
 */
import { describe, expect, it } from "vitest";
import type { PlacementProfileStore } from "~/application/ports/placementProfile.js";
import { DEFAULT_PLACEMENT_PROFILE } from "~/domain/placement/placementProfile.js";
import { USER_A, USER_B } from "../testIds.js";

export function describePlacementProfileContract(
  label: string,
  makeStore: () => Promise<PlacementProfileStore>,
): void {
  describe(`PlacementProfileStore contract — ${label}`, () => {
    it("SEED-5: an absent row resolves the defaults (the B2 frontier, no score, not onboarded)", async () => {
      const store = await makeStore();
      expect(await store.read(USER_A)).toEqual(DEFAULT_PLACEMENT_PROFILE);
    });

    it("SEED-2/4: a full profile round-trips, Date included", async () => {
      const store = await makeStore();
      const onboardedAt = new Date("2026-07-08T09:00:00.000Z");
      await store.write(USER_A, { frontierBand: "C1", lextaleScore: 87.5, onboardedAt });
      expect(await store.read(USER_A)).toEqual({
        frontierBand: "C1",
        lextaleScore: 87.5,
        onboardedAt,
      });
    });

    it("SEED-2: a partial patch merges — unset fields keep their prior value", async () => {
      const store = await makeStore();
      await store.write(USER_A, { frontierBand: "B1" }); // the coarse level step
      await store.write(USER_A, { lextaleScore: 62, frontierBand: "B2" }); // then LexTALE retunes it
      const p = await store.read(USER_A);
      expect(p.frontierBand).toBe("B2");
      expect(p.lextaleScore).toBe(62);
      expect(p.onboardedAt).toBeNull(); // never set → still the default
    });

    it("SEED-1: the onboardedAt stamp survives a later band-only patch", async () => {
      const store = await makeStore();
      const onboardedAt = new Date("2026-07-08T09:00:00.000Z");
      await store.write(USER_A, { onboardedAt });
      await store.write(USER_A, { frontierBand: "C1" });
      expect((await store.read(USER_A)).onboardedAt).toEqual(onboardedAt);
    });

    it("multi-tenant: user B never sees user A's profile — B is still un-onboarded", async () => {
      const store = await makeStore();
      await store.write(USER_A, { frontierBand: "C1", onboardedAt: new Date() });
      expect(await store.read(USER_B)).toEqual(DEFAULT_PLACEMENT_PROFILE);
    });
  });
}
