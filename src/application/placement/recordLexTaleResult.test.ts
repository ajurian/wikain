import { describe, expect, it } from "vitest";
import { recordLexTaleResult } from "./recordLexTaleResult.js";
import { readPlacementProfile } from "./readPlacementProfile.js";
import { LEXTALE_ITEMS } from "../../domain/placement/lextale.js";
import { fakePlacementProfileStore } from "./placementProfileTestDouble.js";

const USER = "u1";
const perfect = new Map(LEXTALE_ITEMS.map((i) => [i.item, i.isWord]));
const allYes = new Map(LEXTALE_ITEMS.map((i) => [i.item, true]));

describe("recordLexTaleResult (SEED-3/SEED-4)", () => {
  it("SEED-4: scores the answers here (never trusts a client scalar) and persists score + band", async () => {
    const { profile } = fakePlacementProfileStore();
    const result = await recordLexTaleResult({ userId: USER, answers: perfect }, { profile });
    expect(result).toEqual({ score: 100, frontierBand: "C1" });
    expect(await readPlacementProfile({ userId: USER }, { profile })).toMatchObject({
      lextaleScore: 100,
      frontierBand: "C1",
    });
  });

  it("SEED-4: a yes-biased run scores 50 and bands DOWN to B1 rather than being rewarded", async () => {
    const { profile } = fakePlacementProfileStore();
    expect(await recordLexTaleResult({ userId: USER, answers: allYes }, { profile })).toEqual({
      score: 50,
      frontierBand: "B1",
    });
  });

  it("SEED-3: writes ONLY the scalar and the band — the score never marks a word known", async () => {
    const { profile, patches } = fakePlacementProfileStore();
    await recordLexTaleResult({ userId: USER, answers: perfect }, { profile });
    // The deps carry no marks/cards store at all (a type-level guarantee, cf. judgeFirstProduction);
    // asserting the emitted patch stops a future field riding along on this write.
    expect(patches).toEqual([{ lextaleScore: 100, frontierBand: "C1" }]);
    expect((await readPlacementProfile({ userId: USER }, { profile })).onboardedAt).toBeNull();
  });

  it("SEED-4: refuses a partial answer set — a short run must not persist a scalar", async () => {
    const { profile, patches } = fakePlacementProfileStore();
    const partial = new Map(perfect);
    partial.delete("wrought");
    await expect(recordLexTaleResult({ userId: USER, answers: partial }, { profile })).rejects.toThrow(
      /wrought/,
    );
    expect(patches).toEqual([]);
  });
});
