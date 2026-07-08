import { describe, it, expect } from "vitest";
import {
  coarseLevelForBand,
  frontierBandForCoarseLevel,
  frontierBandFromLexTale,
  isCoarseLevel,
  type CoarseLevel,
} from "./placement.js";

describe("frontierBandForCoarseLevel (SEED-2/SEED-5)", () => {
  it("maps each coarse level to its catalog frontier band (SEED-2 mechanism i)", () => {
    // The scalar only sets WHERE the frontier is; the list stack selects the words there (SEED-3).
    expect(frontierBandForCoarseLevel("b1")).toBe("B1");
    expect(frontierBandForCoarseLevel("b2")).toBe("B2"); // SEED-5: the PH default productive frontier
    expect(frontierBandForCoarseLevel("c1")).toBe("C1");
  });
});

describe("coarseLevelForBand (SEED-2)", () => {
  it("SEED-2: inverts frontierBandForCoarseLevel for every coarse level", () => {
    const levels: CoarseLevel[] = ["b1", "b2", "c1"];
    for (const level of levels) {
      expect(coarseLevelForBand(frontierBandForCoarseLevel(level))).toBe(level);
    }
  });

  it("SEED-2: returns null for a band no coarse self-report can produce", () => {
    // The retune form pre-selects nothing rather than lying about where the band came from.
    expect(coarseLevelForBand("A2")).toBeNull();
    expect(coarseLevelForBand("b2")).toBeNull(); // the level id, not the band
    expect(coarseLevelForBand("")).toBeNull();
  });
});

describe("isCoarseLevel (SEED-2)", () => {
  it("SEED-2: narrows the three published coarse levels and rejects anything else", () => {
    expect(isCoarseLevel("b2")).toBe(true);
    expect(isCoarseLevel("B2")).toBe(false); // the band, not the self-report id
    expect(isCoarseLevel("a1")).toBe(false);
    expect(isCoarseLevel(7)).toBe(false);
  });
});

describe("frontierBandFromLexTale (SEED-2 mechanism i / SEED-4)", () => {
  it("SEED-4: 80 and above is the advanced band (published cutoff C1–C2 = 80–100)", () => {
    expect(frontierBandFromLexTale(100)).toBe("C1");
    expect(frontierBandFromLexTale(80)).toBe("C1");
  });

  it("SEED-4: 60–80 is upper-intermediate (published cutoff B2 = 60–80)", () => {
    expect(frontierBandFromLexTale(79.9)).toBe("B2");
    expect(frontierBandFromLexTale(60)).toBe("B2");
  });

  it("SEED-4: below 60 falls to B1 — the published table's 59/60 gap resolves downward", () => {
    expect(frontierBandFromLexTale(59.9)).toBe("B1");
    expect(frontierBandFromLexTale(50)).toBe("B1"); // an all-yes (or all-no) run
    expect(frontierBandFromLexTale(0)).toBe("B1");
  });

  it("SEED-4: rejects a score outside [0, 100] rather than banding a corrupt scalar", () => {
    expect(() => frontierBandFromLexTale(101)).toThrow(RangeError);
    expect(() => frontierBandFromLexTale(-1)).toThrow(RangeError);
    expect(() => frontierBandFromLexTale(Number.NaN)).toThrow(RangeError);
  });
});
