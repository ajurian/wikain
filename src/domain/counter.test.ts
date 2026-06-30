import { describe, it, expect } from "vitest";
import { isCounted } from "./counter.js";
import { COUNTER_MIN_SPACED_PASSES, COUNTER_R_FLOOR } from "./constants.js";

describe("isCounted — 'words you can now use' membership (CNT-2, CNT-3, CNT-6)", () => {
  it("CNT-2/CNT-6: a Productive word with the minimum spaced judged passes and R at the floor is counted", () => {
    expect(
      isCounted({ passDays: COUNTER_MIN_SPACED_PASSES, retrievability: COUNTER_R_FLOOR }),
    ).toBe(true);
  });

  it("CNT-2: fewer than the minimum spaced judged passes is not counted", () => {
    expect(
      isCounted({ passDays: COUNTER_MIN_SPACED_PASSES - 1, retrievability: 0.99 }),
    ).toBe(false);
  });

  it("CNT-3: retrievability below the floor drops the word from the counter", () => {
    expect(
      isCounted({ passDays: COUNTER_MIN_SPACED_PASSES, retrievability: COUNTER_R_FLOOR - 0.01 }),
    ).toBe(false);
  });
});
