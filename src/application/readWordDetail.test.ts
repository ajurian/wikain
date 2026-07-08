import { describe, it, expect } from "vitest";
import { readWordDetail, type ReadWordDetailDeps } from "./readWordDetail.js";
import type { Card, FsrsCardState, MasteryState } from "../domain/card.js";
import type { FsrsReviewLog, ReviewLog, ReviewTier } from "../domain/review.js";
import type { Rating } from "../domain/rating.js";
import type { LexicalItem } from "../domain/lexicalItem.js";
import type { CardRepository } from "./ports/cardRepository.js";
import type { Scheduler } from "./ports/scheduler.js";
import type { Catalog } from "./ports/catalog.js";

const NOW = new Date("2026-06-30T00:00:00Z");
const USER = "u1";
const SENSE = "negotiate_verb_01";

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

function card(mastery: MasteryState): Card {
  return { userId: USER, senseId: SENSE, mastery, fsrs: fsrs() };
}

function log(reviewedAt: string, tier: ReviewTier, rating: Rating): ReviewLog {
  return { userId: USER, senseId: SENSE, tier, rating, reviewedAt: new Date(reviewedAt), fsrs: FSRS_STUB };
}

function item(overrides: Partial<LexicalItem> = {}): LexicalItem {
  return {
    word: "negotiate",
    lemma: "negotiate",
    part_of_speech: "verb",
    sense_id: SENSE,
    cefr: "B2",
    zipf: 4.0,
    zipf_rank: 1000,
    intended_sense: null,
    recognition_meaning: "to reach agreement through discussion",
    distractors: ["abandon", "compile", "allocate"],
    clozed_sentence: "We _ the terms.",
    productive_meaning: "to bargain",
    model_sentence: "They negotiate every year.",
    self_reference_prompt: null,
    gen_model: "test",
    gen_spec_version: "0",
    ...overrides,
  };
}

function makeDeps(
  cards: Record<string, Card>,
  logs: ReviewLog[],
  retrievability: number,
  catalogItem: LexicalItem | undefined,
): ReadWordDetailDeps {
  const repo: CardRepository = {
    load: async (_u, senseId) => cards[senseId],
    save: async () => {},
    appendReviewLog: async () => {},
    logsForWord: async () => logs,
    listCards: async () => Object.values(cards),
  };
  const scheduler: Scheduler = {
    newCard: () => fsrs(),
    next: () => {
      throw new Error("not used in the word-detail read-model");
    },
    getRetrievability: () => retrievability,
  };
  const catalog: Catalog = { get: () => catalogItem };
  return { cards: repo, scheduler, catalog };
}

describe("readWordDetail", () => {
  it("returns null when the user has no card for the word (a reachable but empty URL)", async () => {
    const deps = makeDeps({}, [], 0.9, item());
    const res = await readWordDetail({ userId: USER, senseId: SENSE, now: NOW }, deps);
    expect(res).toBeNull();
  });

  it("fails loud when the card exists but the catalog is missing the sense", async () => {
    const deps = makeDeps({ [SENSE]: card("Productive") }, [], 0.9, undefined);
    await expect(readWordDetail({ userId: USER, senseId: SENSE, now: NOW }, deps)).rejects.toThrow(
      /no catalog item/,
    );
  });

  it("CNT-2/CNT-3: maps catalog fields and reports counted + retrievability", async () => {
    const deps = makeDeps(
      { [SENSE]: card("Productive") },
      [log("2026-06-01T09:00:00Z", "free", "Good"), log("2026-06-03T09:00:00Z", "free", "Good")],
      0.9,
      item(),
    );

    const res = await readWordDetail({ userId: USER, senseId: SENSE, now: NOW }, deps);

    expect(res).not.toBeNull();
    expect(res!).toMatchObject({
      lemma: "negotiate",
      pos: "verb",
      cefr: "B2",
      recognitionMeaning: "to reach agreement through discussion",
      modelSentence: "They negotiate every year.",
      mastery: "Productive",
      retrievability: 0.9,
      aboveFloor: true,
      counted: true,
      judgedPassDays: 2,
    });
  });

  it("SM-3/SM-4: builds the mastery history timeline from the logs (oldest-first, with moves)", async () => {
    const deps = makeDeps(
      { [SENSE]: card("Productive") },
      [
        log("2026-06-21T09:00:00Z", "recognition", "Good"),
        log("2026-06-24T09:00:00Z", "cloze", "Good"),
        log("2026-06-27T09:00:00Z", "cued", "Good"),
      ],
      0.9,
      item(),
    );

    const res = await readWordDetail({ userId: USER, senseId: SENSE, now: NOW }, deps);

    expect(res!.history).toHaveLength(3);
    expect(res!.history[0]).toMatchObject({ tier: "recognition", outcome: "pass", moved: undefined });
    expect(res!.history[1]!.moved).toEqual({ from: "Seen", to: "Recognized" });
    expect(res!.history[2]!.moved).toEqual({ from: "Recognized", to: "Productive" });
  });

  it("DM-4: tolerates a null model_sentence (does not fail loud on browse)", async () => {
    const deps = makeDeps({ [SENSE]: card("Seen") }, [], 0.9, item({ model_sentence: null }));
    const res = await readWordDetail({ userId: USER, senseId: SENSE, now: NOW }, deps);
    expect(res!.modelSentence).toBeNull();
  });
});
