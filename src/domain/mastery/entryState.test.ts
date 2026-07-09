import { describe, it, expect } from "vitest";
import { introductionState } from "./entryState.js";

describe("SM-11 placement-known entry state", () => {
  it("SM-11: a placement-known word enters directly at Recognized (skips Seen)", () => {
    expect(introductionState(true)).toBe("Recognized");
  });

  it("SEED-2: an unmarked word enters at Seen (walks the two-step on-ramp)", () => {
    expect(introductionState(false)).toBe("Seen");
  });
});
