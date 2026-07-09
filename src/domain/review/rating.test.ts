import { describe, it, expect } from "vitest";
import { deriveRating } from "./rating.js";

describe("RAT-1 binary rating derivation", () => {
  it("rates a passing outcome Good", () => {
    expect(deriveRating(true)).toBe("Good");
  });

  it("rates a failing outcome Again", () => {
    expect(deriveRating(false)).toBe("Again");
  });
});
