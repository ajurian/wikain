import { describe, expect, it } from "vitest";
import { shouldResumeBatch } from "./absence.js";

const T0 = new Date("2026-07-17T10:00:00Z");
const minutesLater = (m: number) => new Date(T0.getTime() + m * 60_000);

describe("shouldResumeBatch (BAT-11/12/13)", () => {
  it("BAT-12: a return within the absence window resumes", () => {
    expect(shouldResumeBatch(T0, minutesLater(15))).toBe(true);
  });

  it("BAT-12: the boundary is inclusive — a return at exactly T resumes", () => {
    expect(shouldResumeBatch(T0, minutesLater(20))).toBe(true);
  });

  it("BAT-13: a return past the window rebuilds", () => {
    expect(shouldResumeBatch(T0, minutesLater(21))).toBe(false);
  });

  it("honors an injected window (the constant is wiring, not a literal)", () => {
    expect(shouldResumeBatch(T0, minutesLater(25), 30)).toBe(true);
    expect(shouldResumeBatch(T0, minutesLater(25), 10)).toBe(false);
  });
});
