import { describe, it, expect } from "vitest";
import { FrozenScheduler } from "./frozenScheduler.js";
import { TsFsrsScheduler } from "./tsFsrsScheduler.js";
import type { FsrsCardState } from "~/domain/mastery/card.js";

/**
 * The FrozenScheduler is the Dev Tools "freeze FSRS" decorator. It exercises the real ts-fsrs adapter
 * underneath so the log it returns is a genuine FSRS log, but asserts the card never advances.
 */
describe("Dev Tools: FrozenScheduler holds the schedule", () => {
  const NOW = new Date("2026-07-20T12:00:00Z");

  it("next() returns the input card unchanged (due does not advance)", () => {
    const inner = new TsFsrsScheduler();
    const frozen = new FrozenScheduler(inner);
    const card: FsrsCardState = inner.newCard(NOW);

    const real = inner.next(card, "Good", NOW);
    const held = frozen.next(card, "Good", NOW);

    // Sanity: the real scheduler DOES move the card forward…
    expect(real.card.due.getTime()).toBeGreaterThan(card.due.getTime());
    // …but the frozen one returns the exact same card object it was given.
    expect(held.card).toBe(card);
  });

  it("next() still returns a valid FSRS log (mastery replay stays intact)", () => {
    const inner = new TsFsrsScheduler();
    const frozen = new FrozenScheduler(inner);
    const card = inner.newCard(NOW);

    const { log } = frozen.next(card, "Again", NOW);
    // The log is a genuine FSRS log from the wrapped adapter (numeric grade enum, a real review date).
    expect(typeof log.rating).toBe("number");
    expect(log.review instanceof Date).toBe(true);
  });

  it("newCard and getRetrievability delegate untouched", () => {
    const inner = new TsFsrsScheduler();
    const frozen = new FrozenScheduler(inner);
    const card = frozen.newCard(NOW);

    expect(frozen.getRetrievability(card, NOW)).toBe(inner.getRetrievability(card, NOW));
  });
});
