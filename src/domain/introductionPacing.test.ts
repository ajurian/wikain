import { describe, it, expect } from "vitest";
import { newIntroductionsAllowed } from "./introductionPacing.js";
import {
  FIRST_SESSION_SEED_WORDS,
  NEW_PER_DAY,
  NEW_FRACTION_UNDER_BACKLOG,
} from "./constants.js";

describe("SEED-6 introduction pacing", () => {
  it("SEED-1/6: the first session seeds FIRST_SESSION_SEED_WORDS regardless of backlog", () => {
    expect(newIntroductionsAllowed({ isFirstSession: true, dueBacklog: 0 })).toBe(
      FIRST_SESSION_SEED_WORDS,
    );
    expect(newIntroductionsAllowed({ isFirstSession: true, dueBacklog: 100 })).toBe(
      FIRST_SESSION_SEED_WORDS,
    );
  });

  it("SEED-6: with no backlog, the full daily pace NEW_PER_DAY is allowed", () => {
    expect(newIntroductionsAllowed({ isFirstSession: false, dueBacklog: 0 })).toBe(NEW_PER_DAY);
  });

  it("SEED-6: under a backlog, new is capped so new/(new+due) ≤ NEW_FRACTION_UNDER_BACKLOG", () => {
    const dueBacklog = 10;
    const allowed = newIntroductionsAllowed({ isFirstSession: false, dueBacklog });
    // f=0.30, due=10 → floor(0.4286*10)=4; 4/(4+10)=0.2857 ≤ 0.30
    expect(allowed).toBe(4);
    expect(allowed / (allowed + dueBacklog)).toBeLessThanOrEqual(NEW_FRACTION_UNDER_BACKLOG);
  });

  it("SEED-6: a large backlog is still capped at NEW_PER_DAY (whichever is smaller)", () => {
    expect(newIntroductionsAllowed({ isFirstSession: false, dueBacklog: 1000 })).toBe(NEW_PER_DAY);
  });
});
