import { describe, it, expect } from "vitest";
import { coldStartDifficulty } from "./coldStart.js";

describe("SEED-8 cold-start difficulty from CEFR", () => {
  it("SEED-8: higher CEFR yields a higher (monotonic) initial difficulty", () => {
    const a2 = coldStartDifficulty("A2");
    const b2 = coldStartDifficulty("B2");
    const c1 = coldStartDifficulty("C1");
    expect(a2).toBeLessThan(b2);
    expect(b2).toBeLessThan(c1);
  });

  it("SEED-8: stays within FSRS's [1, 10] difficulty bounds", () => {
    for (const cefr of ["A1", "A2", "B1", "B2", "C1"] as const) {
      const d = coldStartDifficulty(cefr);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(10);
    }
  });

  it("SEED-8/DM-2: a null CEFR falls back to a mid-level base within bounds", () => {
    const d = coldStartDifficulty(null);
    expect(d).toBeGreaterThanOrEqual(1);
    expect(d).toBeLessThanOrEqual(10);
  });
});
