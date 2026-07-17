import { describe, it, expect } from "vitest";
import { presentSeededWords } from "./presentSeededWords.js";
import type { Card, FsrsCardState } from "~/domain/mastery/card.js";
import type { LexicalItem } from "~/domain/lexicalItem.js";
import type { Catalog } from "../ports/catalog.js";

const SENSE = "resilient_adj_01";

function makeItem(): LexicalItem {
  return {
    word: "resilient",
    lemma: "resilient",
    part_of_speech: "adj",
    sense_id: SENSE,
    cefr: "B2",
    zipf: 4.0,
    zipf_rank: 1000,
    intended_sense: "able to recover quickly",
    recognition_meaning: "able to recover quickly from difficulty",
    distractors: null,
    clozed_sentence: null,
    productive_meaning: "quick to bounce back",
    model_sentence: "The team stayed resilient after the loss.",
    self_reference_prompt: "When have you had to stay resilient?",
    cloze_fit_set: null,
    bounce_gloss: null,
    fit_set_version: null,
    gen_model: "test",
    gen_spec_version: "test",
  };
}

function makeFsrs(): FsrsCardState {
  return {
    due: new Date("2026-07-04T00:00:00Z"),
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0,
  };
}

function card(senseId: string): Card {
  return { userId: "u1", senseId, mastery: "Seen", fsrs: makeFsrs() };
}

describe("presentSeededWords (SEED-1)", () => {
  it("projects a seeded card onto the catalog fields the onboarding screens render", () => {
    const catalog: Catalog = { get: (id) => (id === SENSE ? makeItem() : undefined) };
    const [view] = presentSeededWords([card(SENSE)], catalog);
    expect(view).toEqual({
      senseId: SENSE,
      lemma: "resilient",
      pos: "adj",
      cefr: "B2",
      recognitionMeaning: "able to recover quickly from difficulty",
      selfReferencePrompt: "When have you had to stay resilient?",
    });
  });

  it("fails loud on a missing catalog entry (a seeded word must exist in the catalog)", () => {
    const emptyCatalog: Catalog = { get: () => undefined };
    expect(() => presentSeededWords([card(SENSE)], emptyCatalog)).toThrow(/unknown sense_id/);
  });
});
