import { describe, expect, it } from "vitest";
import { recordCoarseLevel } from "./recordCoarseLevel.js";
import { readPlacementProfile } from "./readPlacementProfile.js";
import { recordLexTaleResult } from "./recordLexTaleResult.js";
import { LEXTALE_ITEMS } from "~/domain/placement/lextale.js";
import { fakePlacementProfileStore } from "./placementProfileTestDouble.js";

const USER = "u1";

describe("recordCoarseLevel (SEED-2 mechanism i)", () => {
  it("SEED-2: persists the band the coarse level maps to, and returns it", async () => {
    const { profile } = fakePlacementProfileStore();
    const band = await recordCoarseLevel({ userId: USER, level: "c1" }, { profile });
    expect(band).toBe("C1");
    expect((await readPlacementProfile({ userId: USER }, { profile })).frontierBand).toBe("C1");
  });

  it("SEED-3: writes ONLY the band and the scalar's provenance — never marks a word known", async () => {
    const { profile, patches } = fakePlacementProfileStore();
    await recordCoarseLevel({ userId: USER, level: "b1" }, { profile });
    expect(patches).toEqual([{ frontierBand: "B1", lextaleScore: null }]);
  });

  it("SEED-4: a coarse retune clears a stale LexTALE scalar — the band no longer comes from the instrument", async () => {
    const { profile } = fakePlacementProfileStore();
    // A real LexTALE run first (score 100 ⇒ C1), then the learner retunes down by self-report.
    await recordLexTaleResult(
      { userId: USER, answers: new Map(LEXTALE_ITEMS.map((i) => [i.item, i.isWord])) },
      { profile },
    );
    expect((await readPlacementProfile({ userId: USER }, { profile })).lextaleScore).toBe(100);

    await recordCoarseLevel({ userId: USER, level: "b1" }, { profile });

    const after = await readPlacementProfile({ userId: USER }, { profile });
    expect(after.frontierBand).toBe("B1");
    // Keeping 100 here would render "B1 — LexTALE 100%": a band attributed to an instrument that did
    // not produce it. The scalar is only meaningful as the SOURCE of the current band.
    expect(after.lextaleScore).toBeNull();
  });

  it("SEED-1: a retune never disturbs the onboarding stamp", async () => {
    const { profile } = fakePlacementProfileStore();
    const onboardedAt = new Date("2026-07-08T09:00:00Z");
    await profile.write(USER, { onboardedAt });
    await recordCoarseLevel({ userId: USER, level: "c1" }, { profile });
    expect((await readPlacementProfile({ userId: USER }, { profile })).onboardedAt).toEqual(onboardedAt);
  });
});

describe("readPlacementProfile (SEED-2)", () => {
  it("SEED-2/SEED-5: an untouched user resolves the default profile — the B2 band, nothing else", async () => {
    const { profile } = fakePlacementProfileStore();
    expect(await readPlacementProfile({ userId: USER }, { profile })).toEqual({
      frontierBand: "B2",
      lextaleScore: null,
      onboardedAt: null,
    });
  });
});
