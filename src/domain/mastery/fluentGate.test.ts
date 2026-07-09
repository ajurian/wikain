import { describe, it, expect } from "vitest";
import { qualifiesForFluent } from "./fluentGate.js";
import { FLUENT_JUDGED_PASSES, FLUENT_MIN_STABILITY_DAYS } from "../constants.js";

describe("qualifiesForFluent (SM-5 a/b/c/d)", () => {
  it("SM-5: qualifies when all four conditions are met", () => {
    expect(
      qualifiesForFluent({
        passDays: FLUENT_JUDGED_PASSES,
        stability: FLUENT_MIN_STABILITY_DAYS,
        mostRecentScaffolded: false,
      }),
    ).toBe(true);
  });

  it("SM-5(a): too few spaced judged passes blocks promotion", () => {
    expect(
      qualifiesForFluent({
        passDays: FLUENT_JUDGED_PASSES - 1,
        stability: FLUENT_MIN_STABILITY_DAYS,
        mostRecentScaffolded: false,
      }),
    ).toBe(false);
  });

  it("SM-5(c): stability below the floor blocks promotion", () => {
    expect(
      qualifiesForFluent({
        passDays: FLUENT_JUDGED_PASSES,
        stability: FLUENT_MIN_STABILITY_DAYS - 0.01,
        mostRecentScaffolded: false,
      }),
    ).toBe(false);
  });

  it("SM-5(d): a scaffolded most-recent pass blocks promotion even when count/days/stability are met", () => {
    expect(
      qualifiesForFluent({
        passDays: FLUENT_JUDGED_PASSES,
        stability: FLUENT_MIN_STABILITY_DAYS,
        mostRecentScaffolded: true,
      }),
    ).toBe(false);
  });
});
