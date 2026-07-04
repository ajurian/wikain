import { describe, it, expect } from "vitest";
import { tallyMastery, type LadderEntry } from "./masteryLadder.js";
import type { Card, FsrsCardState, MasteryState } from "./card.js";

function fsrs(): FsrsCardState {
  return {
    due: new Date("2026-06-30T00:00:00Z"),
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0,
  };
}

function card(senseId: string, mastery: MasteryState): Card {
  return { userId: "u1", senseId, mastery, fsrs: fsrs() };
}

describe("tallyMastery (SM-1 ladder distribution)", () => {
  it("returns the four carded states in ascending ladder order", () => {
    const ladder = tallyMastery([]);
    expect(ladder.map((e: LadderEntry) => e.state)).toEqual([
      "Seen",
      "Recognized",
      "Productive",
      "Fluent",
    ]);
  });

  it("returns zero counts for an empty card set", () => {
    expect(tallyMastery([]).every((e) => e.count === 0)).toBe(true);
  });

  it("tallies each card into its mastery bucket", () => {
    const cards = [
      card("a", "Seen"),
      card("b", "Recognized"),
      card("c", "Recognized"),
      card("d", "Productive"),
      card("e", "Fluent"),
      card("f", "Fluent"),
      card("g", "Fluent"),
    ];
    expect(tallyMastery(cards)).toEqual([
      { state: "Seen", count: 1 },
      { state: "Recognized", count: 2 },
      { state: "Productive", count: 1 },
      { state: "Fluent", count: 3 },
    ]);
  });

  it("omits the New pre-state (no persisted card is New; SM-1)", () => {
    // A New card is defensive — it must neither appear nor be tallied into another bucket.
    const ladder = tallyMastery([card("x", "New"), card("y", "Seen")]);
    expect(ladder.some((e) => (e.state as string) === "New")).toBe(false);
    expect(ladder.reduce((n, e) => n + e.count, 0)).toBe(1);
  });
});
