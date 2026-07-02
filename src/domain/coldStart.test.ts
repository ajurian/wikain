import { describe, it, expect } from "vitest";
import { coldStartDifficulty } from "./coldStart.js";

describe("SEED-8 cold-start difficulty from CEFR × band", () => {
  it("SEED-8: higher CEFR yields a higher (monotonic) initial difficulty", () => {
    const a1 = coldStartDifficulty("A1", "A1");
    const b2 = coldStartDifficulty("B2", "B2");
    const c1 = coldStartDifficulty("C1", "C1");
    expect(a1).toBeLessThan(b2);
    expect(b2).toBeLessThan(c1);
  });

  it("SEED-8: stays within FSRS's [1, 10] difficulty bounds", () => {
    for (const cefr of ["A1", "A2", "B1", "B2", "C1"] as const) {
      const d = coldStartDifficulty(cefr, cefr);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(10);
    }
  });

  it("SEED-8/DM-2: a null CEFR (NAWL) falls back to the band label's level", () => {
    // band "C1" with null cefr should match the C1 difficulty of an explicit-C1 item.
    expect(coldStartDifficulty(null, "C1")).toBe(coldStartDifficulty("C1", "C1"));
  });

  it("SEED-8: a level-spanning band (B2-C1) sits above its lower level (uses band, not just CEFR)", () => {
    expect(coldStartDifficulty("B2", "B2-C1")).toBeGreaterThan(coldStartDifficulty("B2", "B2"));
  });
});
