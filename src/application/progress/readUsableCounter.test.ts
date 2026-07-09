import { describe, it, expect } from "vitest";
import { readUsableCounter, type ReadUsableCounterDeps } from "./readUsableCounter.js";
import type { Card, FsrsCardState } from "~/domain/mastery/card.js";
import type { FsrsReviewLog, ReviewLog, ReviewTier } from "~/domain/review/review.js";
import type { Rating } from "~/domain/review/rating.js";
import type { CardRepository } from "../ports/cardRepository.js";
import type { Scheduler } from "../ports/scheduler.js";
import { COUNTER_R_FLOOR } from "~/domain/constants.js";

const NOW = new Date("2026-06-30T00:00:00Z");
const USER = "u1";

const FSRS_STUB: FsrsReviewLog = {
  rating: 3,
  state: 2,
  due: NOW,
  stability: 1,
  difficulty: 5,
  elapsed_days: 0,
  last_elapsed_days: 0,
  scheduled_days: 1,
  review: NOW,
};

function fsrs(): FsrsCardState {
  return {
    due: NOW,
    stability: 30,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 1,
    lapses: 0,
    state: 2,
  };
}

function card(senseId: string): Card {
  return { userId: USER, senseId, mastery: "Productive", fsrs: fsrs() };
}

function log(senseId: string, reviewedAt: string, tier: ReviewTier, rating: Rating): ReviewLog {
  return { userId: USER, senseId, tier, rating, reviewedAt: new Date(reviewedAt), fsrs: FSRS_STUB };
}

/** Two free passes on two separate calendar days → counter-eligible by pass count (CNT-2). */
function twoSpacedPasses(senseId: string): ReviewLog[] {
  return [
    log(senseId, "2026-06-01T09:00:00Z", "free", "Good"),
    log(senseId, "2026-06-03T09:00:00Z", "free", "Good"),
  ];
}

function makeDeps(
  cards: Card[],
  logsBySense: Record<string, ReviewLog[]>,
  retrievabilityBySense: Record<string, number>,
): ReadUsableCounterDeps {
  const repo: CardRepository = {
    load: async () => undefined,
    save: async () => {},
    appendReviewLog: async () => {},
    logsForWord: async (_u, senseId) => logsBySense[senseId] ?? [],
    listCards: async () => cards,
  };
  const scheduler: Scheduler = {
    newCard: () => fsrs(),
    next: () => {
      throw new Error("not used in the counter read-model");
    },
    // Keyed by sense via the card's fsrs identity (each test card has its own fsrs object).
    getRetrievability: (cardFsrs) => {
      const owner = cards.find((c) => c.fsrs === cardFsrs);
      return owner ? (retrievabilityBySense[owner.senseId] ?? 1) : 1;
    },
  };
  return { cards: repo, scheduler };
}

describe("readUsableCounter (CNT-2, CNT-3, CNT-6)", () => {
  it("CNT-2/CNT-6: counts a Productive word with 2 spaced judged passes and R ≥ floor", async () => {
    const deps = makeDeps(
      [card("negotiate_verb_01")],
      { negotiate_verb_01: twoSpacedPasses("negotiate_verb_01") },
      { negotiate_verb_01: 0.95 },
    );

    const res = await readUsableCounter({ userId: USER, now: NOW }, deps);

    expect(res.count).toBe(1);
    expect(res.senseIds).toEqual(["negotiate_verb_01"]);
  });

  it("INV-4: a word with 1 judged pass + several cued passes is not counted", async () => {
    const deps = makeDeps(
      [card("abandon_verb_01")],
      {
        abandon_verb_01: [
          log("abandon_verb_01", "2026-06-01T09:00:00Z", "free", "Good"),
          log("abandon_verb_01", "2026-06-02T09:00:00Z", "cued", "Good"),
          log("abandon_verb_01", "2026-06-03T09:00:00Z", "cued", "Good"),
        ],
      },
      { abandon_verb_01: 0.95 },
    );

    const res = await readUsableCounter({ userId: USER, now: NOW }, deps);

    expect(res.count).toBe(0);
  });

  it("CNT-3/CNT-4: a qualifying word whose retrievability has decayed below the floor is excluded", async () => {
    const deps = makeDeps(
      [card("negotiate_verb_01")],
      { negotiate_verb_01: twoSpacedPasses("negotiate_verb_01") },
      { negotiate_verb_01: COUNTER_R_FLOOR - 0.05 },
    );

    const res = await readUsableCounter({ userId: USER, now: NOW }, deps);

    expect(res.count).toBe(0);
    expect(res.senseIds).toEqual([]);
  });

  it("tallies only the qualifying words across a mixed set", async () => {
    const deps = makeDeps(
      [card("a_verb_01"), card("b_verb_01"), card("c_verb_01")],
      {
        a_verb_01: twoSpacedPasses("a_verb_01"), // counted
        b_verb_01: twoSpacedPasses("b_verb_01"), // R too low → excluded
        c_verb_01: [log("c_verb_01", "2026-06-01T09:00:00Z", "free", "Good")], // 1 pass → excluded
      },
      { a_verb_01: 0.9, b_verb_01: 0.4, c_verb_01: 0.9 },
    );

    const res = await readUsableCounter({ userId: USER, now: NOW }, deps);

    expect(res.count).toBe(1);
    expect(res.senseIds).toEqual(["a_verb_01"]);
  });
});
