import { describe, it, expect } from "vitest";
import { readWordsList, type ReadWordsListDeps } from "./readWordsList.js";
import type { Card, FsrsCardState, MasteryState } from "../../domain/mastery/card.js";
import type { FsrsReviewLog, ReviewLog, ReviewTier } from "../../domain/review/review.js";
import type { Rating } from "../../domain/review/rating.js";
import type { LexicalItem } from "../../domain/lexicalItem.js";
import type { CardRepository } from "../ports/cardRepository.js";
import type { Scheduler } from "../ports/scheduler.js";
import type { Catalog } from "../ports/catalog.js";
import { COUNTER_R_FLOOR } from "../../domain/constants.js";

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
  return { due: NOW, stability: 30, difficulty: 5, elapsed_days: 0, scheduled_days: 0, reps: 1, lapses: 0, state: 2 };
}

function card(senseId: string, mastery: MasteryState): Card {
  return { userId: USER, senseId, mastery, fsrs: fsrs() };
}

function log(senseId: string, reviewedAt: string, tier: ReviewTier, rating: Rating): ReviewLog {
  return { userId: USER, senseId, tier, rating, reviewedAt: new Date(reviewedAt), fsrs: FSRS_STUB };
}

function twoSpacedPasses(senseId: string): ReviewLog[] {
  return [
    log(senseId, "2026-06-01T09:00:00Z", "free", "Good"),
    log(senseId, "2026-06-03T09:00:00Z", "free", "Good"),
  ];
}

function item(senseId: string, lemma: string): LexicalItem {
  return {
    word: lemma,
    lemma,
    part_of_speech: "verb",
    sense_id: senseId,
    cefr: "B2",
    zipf: 4.0,
    zipf_rank: 1000,
    intended_sense: null,
    recognition_meaning: "to reach agreement",
    distractors: ["abandon", "compile", "allocate"],
    clozed_sentence: "We _ the terms.",
    productive_meaning: "to bargain",
    model_sentence: "They negotiate every year.",
    self_reference_prompt: null,
    gen_model: "test",
    gen_spec_version: "0",
  };
}

function makeDeps(
  cards: Card[],
  logsBySense: Record<string, ReviewLog[]>,
  retrievabilityBySense: Record<string, number>,
  lemmaBySense: Record<string, string>,
): ReadWordsListDeps {
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
      throw new Error("not used in the words-list read-model");
    },
    getRetrievability: (cardFsrs) => {
      const owner = cards.find((c) => c.fsrs === cardFsrs);
      return owner ? (retrievabilityBySense[owner.senseId] ?? 1) : 1;
    },
  };
  const catalog: Catalog = {
    get: (senseId) => (lemmaBySense[senseId] ? item(senseId, lemmaBySense[senseId]) : undefined),
  };
  return { cards: repo, scheduler, catalog };
}

describe("readWordsList (CNT-2, CNT-3)", () => {
  it("CNT-2/CNT-3: reports counted + aboveFloor + judgedPassDays per word", async () => {
    const deps = makeDeps(
      [card("negotiate_verb_01", "Productive")],
      { negotiate_verb_01: twoSpacedPasses("negotiate_verb_01") },
      { negotiate_verb_01: 0.9 },
      { negotiate_verb_01: "negotiate" },
    );

    const { words } = await readWordsList({ userId: USER, now: NOW }, deps);

    expect(words).toHaveLength(1);
    expect(words[0]).toMatchObject({
      senseId: "negotiate_verb_01",
      lemma: "negotiate",
      mastery: "Productive",
      retrievability: 0.9,
      aboveFloor: true,
      counted: true,
      judgedPassDays: 2,
    });
  });

  it("CNT-3: a word whose retrievability decayed below the floor is not counted and not aboveFloor", async () => {
    const deps = makeDeps(
      [card("negotiate_verb_01", "Productive")],
      { negotiate_verb_01: twoSpacedPasses("negotiate_verb_01") },
      { negotiate_verb_01: COUNTER_R_FLOOR - 0.05 },
      { negotiate_verb_01: "negotiate" },
    );

    const { words } = await readWordsList({ userId: USER, now: NOW }, deps);

    expect(words[0]!.aboveFloor).toBe(false);
    expect(words[0]!.counted).toBe(false);
    expect(words[0]!.judgedPassDays).toBe(2); // pass count is independent of live R
  });

  it("returns every carded word (New/mastery filtering is the presentation layer's job)", async () => {
    const deps = makeDeps(
      [card("a_verb_01", "Seen"), card("b_verb_01", "Fluent")],
      {},
      { a_verb_01: 0.9, b_verb_01: 0.9 },
      { a_verb_01: "alpha", b_verb_01: "bravo" },
    );

    const { words } = await readWordsList({ userId: USER, now: NOW }, deps);

    expect(words.map((w) => w.senseId)).toEqual(["a_verb_01", "b_verb_01"]);
  });

  it("fails loud when a card's sense is missing from the catalog", async () => {
    const deps = makeDeps([card("ghost_verb_01", "Seen")], {}, { ghost_verb_01: 0.9 }, {});

    await expect(readWordsList({ userId: USER, now: NOW }, deps)).rejects.toThrow(/no catalog item/);
  });
});
