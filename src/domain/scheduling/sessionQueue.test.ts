import { describe, it, expect } from "vitest";
import { orderSessionQueue } from "./sessionQueue.js";
import type { Card, MasteryState } from "../mastery/card.js";

/**
 * Cards only need `senseId` + `fsrs.due` for surfacing/ordering; the rest of the FSRS payload is
 * irrelevant here, so a minimal factory keeps each scenario legible.
 */
function card(senseId: string, dueISO: string, mastery: MasteryState = "Recognized"): Card {
  return {
    userId: "u1",
    senseId,
    mastery,
    fsrs: {
      due: new Date(dueISO),
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 1,
      lapses: 0,
      state: 2,
    },
  };
}

const NOW = new Date("2026-07-02T12:00:00Z");

describe("LOOP-1 step 1: due-word surfacing", () => {
  it("no cards → empty queue", () => {
    expect(orderSessionQueue([], [], NOW)).toEqual([]);
  });

  it("excludes cards not yet due (due > now)", () => {
    const cards = [
      card("due", "2026-07-02T00:00:00Z"),
      card("future", "2026-07-03T00:00:00Z"),
    ];
    expect(orderSessionQueue(cards, [], NOW)).toEqual(["due"]);
  });

  it("includes a card due exactly at now (inclusive boundary)", () => {
    expect(orderSessionQueue([card("edge", NOW.toISOString())], [], NOW)).toEqual(["edge"]);
  });

  it("orders due reviews most-overdue-first (due ascending)", () => {
    const cards = [
      card("recent", "2026-07-02T10:00:00Z"),
      card("oldest", "2026-06-01T00:00:00Z"),
      card("middle", "2026-07-01T00:00:00Z"),
    ];
    expect(orderSessionQueue(cards, [], NOW)).toEqual(["oldest", "middle", "recent"]);
  });

  it("tiebreaks equal due dates by senseId (deterministic)", () => {
    const cards = [
      card("b", "2026-07-01T00:00:00Z"),
      card("a", "2026-07-01T00:00:00Z"),
    ];
    expect(orderSessionQueue(cards, [], NOW)).toEqual(["a", "b"]);
  });
});

describe("SEED-6: fresh intros interleaved with due reviews", () => {
  it("with no due reviews, the queue is just the intros (in the given order)", () => {
    const cards = [
      card("i0", NOW.toISOString(), "Seen"),
      card("i1", NOW.toISOString(), "Seen"),
    ];
    expect(orderSessionQueue(cards, ["i0", "i1"], NOW)).toEqual(["i0", "i1"]);
  });

  it("preserves the given intro order (list-stack order), not senseId order", () => {
    const cards = [
      card("zeta", NOW.toISOString(), "Seen"),
      card("alpha", NOW.toISOString(), "Seen"),
    ];
    expect(orderSessionQueue(cards, ["zeta", "alpha"], NOW)).toEqual(["zeta", "alpha"]);
  });

  it("interleaves an intro among reviews — not clustered at the front or the back", () => {
    const cards = [
      card("r0", "2026-06-01T00:00:00Z"),
      card("r1", "2026-06-02T00:00:00Z"),
      card("r2", "2026-06-03T00:00:00Z"),
      card("x", NOW.toISOString(), "Seen"),
    ];
    const queue = orderSessionQueue(cards, ["x"], NOW);
    // All four surface; reviews keep their due-ascending relative order.
    expect(queue).toHaveLength(4);
    expect(queue.filter((s) => s !== "x")).toEqual(["r0", "r1", "r2"]);
    // The intro is neither first nor last → genuinely interleaved (SEED-6).
    const xi = queue.indexOf("x");
    expect(xi).toBeGreaterThan(0);
    expect(xi).toBeLessThan(queue.length - 1);
  });

  it("spreads multiple intros across the review run (both surface, order kept)", () => {
    const cards = [
      card("r0", "2026-06-01T00:00:00Z"),
      card("r1", "2026-06-02T00:00:00Z"),
      card("x0", NOW.toISOString(), "Seen"),
      card("x1", NOW.toISOString(), "Seen"),
    ];
    const queue = orderSessionQueue(cards, ["x0", "x1"], NOW);
    expect(queue).toHaveLength(4);
    expect(queue.filter((s) => s === "r0" || s === "r1")).toEqual(["r0", "r1"]);
    expect(queue.filter((s) => s === "x0" || s === "x1")).toEqual(["x0", "x1"]);
    // Not both intros adjacent-at-front and not both at back: they bracket at least one review.
    expect(queue.indexOf("x0")).toBeLessThan(queue.indexOf("x1"));
  });

  it("a senseId named as an intro but whose card is not due is excluded (uniform due filter)", () => {
    const cards = [card("i", "2026-07-03T00:00:00Z", "Seen")]; // due in the future
    expect(orderSessionQueue(cards, ["i"], NOW)).toEqual([]);
  });
});
