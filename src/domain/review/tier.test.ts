import { describe, it, expect } from "vitest";
import { selectTier } from "./tier.js";

describe("selectTier — mastery state selects the tier (SM-1)", () => {
  it("SM-1: Recognized selects the deterministic cued tier", () => {
    expect(selectTier("Recognized")).toBe("cued");
  });

  it("SM-1: Productive selects the judged free-production tier", () => {
    expect(selectTier("Productive")).toBe("free");
  });

  it("SM-1: Fluent selects the judged branch (maintenance, every rep — JDG-8)", () => {
    expect(selectTier("Fluent")).toBe("free");
  });

  it("SM-3: Seen is routed via the on-ramp ledger upstream, not by selectTier — reaching it throws", () => {
    expect(() => selectTier("Seen")).toThrow(/onRampLedger/);
  });

  it("SM-1: New is a pre-state with no tier and throws (introduction is seeding, spec/09)", () => {
    expect(() => selectTier("New")).toThrow(/deferred/);
  });
});
