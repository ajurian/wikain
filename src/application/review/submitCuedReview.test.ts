import { describe, it, expect } from "vitest";
import { submitCuedReview, type SubmitCuedReviewDeps } from "./submitCuedReview.js";
import type { Card, FsrsCardState, MasteryState } from "../../domain/mastery/card.js";
import type { LexicalItem } from "../../domain/lexicalItem.js";
import type { FsrsReviewLog, ReviewLog } from "../../domain/review/review.js";
import type { Rating } from "../../domain/review/rating.js";
import type { Catalog } from "../ports/catalog.js";
import type { CardRepository } from "../ports/cardRepository.js";
import type { Lemmatizer } from "../ports/lemmatizer.js";
import type { Scheduler } from "../ports/scheduler.js";

const NOW = new Date("2026-06-30T00:00:00Z");
const SENSE = "negotiate_verb_01";

function makeItem(): LexicalItem {
  return {
    word: "negotiate",
    lemma: "negotiate",
    part_of_speech: "verb",
    sense_id: SENSE,
    cefr: "B1",
    zipf: 4.0,
    zipf_rank: 1000,
    intended_sense: null,
    recognition_meaning: null,
    distractors: null,
    clozed_sentence: null,
    productive_meaning: "to reach an agreement by discussion",
    model_sentence: null,
    self_reference_prompt: null,
    gen_model: "test",
    gen_spec_version: "test",
  };
}

const catalog: Catalog = {
  get: (id) => (id === SENSE ? makeItem() : undefined),
};

/** A fake that simply lowercases and splits — match is controlled by what `response` is fed. */
const lemmatizer: Lemmatizer = {
  formsOf: (text) => text.toLowerCase().split(/\s+/).filter(Boolean),
};

function makeFsrs(state: number): FsrsCardState {
  return {
    due: NOW,
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 1,
    lapses: 0,
    state,
  };
}

/** Records each rating it was asked to schedule and returns a card due one day later. */
function makeScheduler(): { scheduler: Scheduler; calls: Rating[] } {
  const calls: Rating[] = [];
  const scheduler: Scheduler = {
    newCard: () => makeFsrs(0),
    next: (card, rating, now) => {
      calls.push(rating);
      const next: FsrsCardState = {
        ...card,
        reps: card.reps + 1,
        state: 2,
        due: new Date(now.getTime() + 86_400_000),
      };
      const log: FsrsReviewLog = {
        rating: rating === "Good" ? 3 : 1,
        state: card.state,
        due: card.due,
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: 0,
        last_elapsed_days: 0,
        scheduled_days: 1,
        review: now,
      };
      return { card: next, log };
    },
    getRetrievability: () => 1,
  };
  return { scheduler, calls };
}

function makeRepo(initial: Card): {
  cards: CardRepository;
  logs: ReviewLog[];
  stored: () => Card;
} {
  let card = initial;
  const logs: ReviewLog[] = [];
  const cards: CardRepository = {
    load: async () => card,
    save: async (c) => {
      card = c;
    },
    appendReviewLog: async (l) => {
      logs.push(l);
    },
    logsForWord: async (userId, senseId) =>
      logs.filter((l) => l.userId === userId && l.senseId === senseId),
    listCards: async () => [card],
  };
  return { cards, logs, stored: () => card };
}

function recognizedCard(state = 1): Card {
  return { userId: "u1", senseId: SENSE, mastery: "Recognized", fsrs: makeFsrs(state) };
}

function deps(card: Card): {
  d: SubmitCuedReviewDeps;
  calls: Rating[];
  logs: ReviewLog[];
  stored: () => Card;
} {
  const { scheduler, calls } = makeScheduler();
  const repo = makeRepo(card);
  return {
    d: { catalog, cards: repo.cards, scheduler, lemmatizer },
    calls,
    logs: repo.logs,
    stored: repo.stored,
  };
}

describe("submitCuedReview", () => {
  it("RAT-1: a correct cued response rates Good and schedules with Good", async () => {
    const { d, calls } = deps(recognizedCard());
    const res = await submitCuedReview(
      { userId: "u1", senseId: SENSE, response: "negotiate", now: NOW },
      d,
    );
    expect(res.passed).toBe(true);
    expect(res.rating).toBe("Good");
    expect(calls).toEqual(["Good"]);
  });

  it("SM-4: a cued pass promotes Recognized → Productive", async () => {
    const { d, stored } = deps(recognizedCard());
    const res = await submitCuedReview(
      { userId: "u1", senseId: SENSE, response: "negotiate", now: NOW },
      d,
    );
    expect(res.mastery).toBe("Productive");
    expect(stored().mastery).toBe("Productive");
  });

  it("RAT-1 + SM-6: a wrong cued response rates Again, reschedules, and does NOT demote", async () => {
    const { d, calls, stored } = deps(recognizedCard());
    const res = await submitCuedReview(
      { userId: "u1", senseId: SENSE, response: "banana", now: NOW },
      d,
    );
    expect(res.passed).toBe(false);
    expect(res.rating).toBe("Again");
    expect(calls).toEqual(["Again"]); // rescheduled (a deterministic fail still rates)
    expect(res.mastery).toBe("Recognized"); // floor unchanged — no demotion
    expect(stored().mastery).toBe("Recognized");
  });

  it("INV-3: the mastery transition is independent of the FSRS internal state", async () => {
    const outcomes: MasteryState[] = [];
    for (const fsrsState of [1, 2, 3]) {
      const { d } = deps(recognizedCard(fsrsState));
      const res = await submitCuedReview(
        { userId: "u1", senseId: SENSE, response: "negotiate", now: NOW },
        d,
      );
      outcomes.push(res.mastery);
    }
    // Same mastery result regardless of the FSRS state → mastery is not derived from it.
    expect(outcomes).toEqual(["Productive", "Productive", "Productive"]);
  });

  it("RAT-8: exactly one ReviewLog is persisted per rated review", async () => {
    const { d, logs } = deps(recognizedCard());
    await submitCuedReview(
      { userId: "u1", senseId: SENSE, response: "negotiate", now: NOW },
      d,
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]?.tier).toBe("cued");
    expect(logs[0]?.rating).toBe("Good");
  });
});
