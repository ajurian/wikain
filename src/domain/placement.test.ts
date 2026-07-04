import { describe, it, expect } from "vitest";
import { frontierBandForCoarseLevel } from "./placement.js";

describe("frontierBandForCoarseLevel (SEED-2/SEED-5)", () => {
  it("maps each coarse level to its catalog frontier band (SEED-2 mechanism i)", () => {
    // The scalar only sets WHERE the frontier is; the list stack selects the words there (SEED-3).
    expect(frontierBandForCoarseLevel("b1")).toBe("B1");
    expect(frontierBandForCoarseLevel("b2")).toBe("B2"); // SEED-5: the PH default productive frontier
    expect(frontierBandForCoarseLevel("c1")).toBe("C1");
  });
});
