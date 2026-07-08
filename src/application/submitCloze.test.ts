import { describe, it, expect } from "vitest";
import { submitCloze, type SubmitClozeDeps } from "./submitCloze.js";
import type { Card, FsrsCardState } from "../domain/card.js";
import type { LexicalItem } from "../domain/lexicalItem.js";
import type { FsrsReviewLog, ReviewLog } from "../domain/review.js";
import type { Rating } from "../domain/rating.js";
import type { Catalog } from "./ports/catalog.js";
import type { CardRepository } from "./ports/cardRepository.js";
import type { Lemmatizer } from "./ports/lemmatizer.js";
import type { Scheduler } from "./ports/scheduler.js";

const NOW = new Date("2026-07-01T00:00:00Z");
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
    clozed_sentence: "The two sides met to _ a ceasefire.",
    productive_meaning: null,
    model_sentence: null,
    self_reference_prompt: null,
    gen_model: "test",
    gen_spec_version: "test",
  };
}

const catalog: Catalog = { get: (id) => (id === SENSE ? makeItem() : undefined) };

/** A fake that lowercases and splits — the match is controlled by what `response` is fed. */
const lemmatizer: Lemmatizer = { formsOf: (text) => text.toLowerCase().split(/\s+/).filter(Boolean) };

function makeFsrs(state: number): FsrsCardState {
  return { due: NOW, stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 0, reps: 1, lapses: 0, state };
}

function makeScheduler(): { scheduler: Scheduler; calls: Rating[] } {
  const calls: Rating[] = [];
  const scheduler: Scheduler = {
    newCard: () => makeFsrs(0),
    next: (card, rating, now) => {
      calls.push(rating);
      const next: FsrsCardState = { ...card, reps: card.reps + 1, state: 2, due: new Date(now.getTime() + 86_400_000) };
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

function makeRepo(initial: Card): { cards: CardRepository; logs: ReviewLog[]; stored: () => Card } {
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
    logsForWord: async (u, s) => logs.filter((l) => l.userId === u && l.senseId === s),
    listCards: async () => [card],
  };
  return { cards, logs, stored: () => card };
}

function seenCard(): Card {
  return { userId: "u1", senseId: SENSE, mastery: "Seen", fsrs: makeFsrs(1) };
}

function deps(card: Card): { d: SubmitClozeDeps; calls: Rating[]; logs: ReviewLog[]; stored: () => Card } {
  const { scheduler, calls } = makeScheduler();
  const repo = makeRepo(card);
  return { d: { catalog, cards: repo.cards, scheduler, lemmatizer }, calls, logs: repo.logs, stored: repo.stored };
}

describe("submitCloze (Seen typed cloze)", () => {
  it("TIER-5 / SM-3: a correct inflected cloze answer promotes Seen → Recognized", async () => {
    const { d, calls, stored } = deps(seenCard());
    const res = await submitCloze({ userId: "u1", senseId: SENSE, response: "negotiate", now: NOW }, d);
    expect(res.passed).toBe(true);
    expect(res.rating).toBe("Good");
    expect(calls).toEqual(["Good"]);
    expect(res.mastery).toBe("Recognized"); // SM-3: promotion fires on the cloze pass
    expect(stored().mastery).toBe("Recognized");
  });

  it("RAT-1 / SM-6: a wrong cloze answer rates Again, reschedules, and does NOT demote (stays Seen)", async () => {
    const { d, calls, stored } = deps(seenCard());
    const res = await submitCloze({ userId: "u1", senseId: SENSE, response: "surrender", now: NOW }, d);
    expect(res.passed).toBe(false);
    expect(res.rating).toBe("Again");
    expect(calls).toEqual(["Again"]);
    expect(res.mastery).toBe("Seen");
    expect(stored().mastery).toBe("Seen");
  });

  it("RAT-8: exactly one ReviewLog tagged 'cloze' is persisted", async () => {
    const { d, logs } = deps(seenCard());
    await submitCloze({ userId: "u1", senseId: SENSE, response: "negotiate", now: NOW }, d);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.tier).toBe("cloze");
  });
});
