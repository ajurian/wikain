import { describe, it, expect } from "vitest";
import { readPlacementSlate, type ReadPlacementSlateDeps } from "./readPlacementSlate.js";
import type { Card } from "~/domain/mastery/card.js";
import type { Cefr, LexicalItem } from "~/domain/lexicalItem.js";
import type { Catalog } from "../ports/catalog.js";
import type { WordSource } from "../ports/wordSource.js";
import type { CardRepository } from "../ports/cardRepository.js";

function makeItem(senseId: string, cefr: Cefr = "B2"): LexicalItem {
  return {
    word: senseId,
    lemma: `lemma-${senseId}`,
    part_of_speech: "verb",
    sense_id: senseId,
    cefr,
    zipf: 4.0,
    zipf_rank: 1000,
    intended_sense: null,
    recognition_meaning: null,
    distractors: null,
    clozed_sentence: null,
    productive_meaning: null,
    model_sentence: null,
    self_reference_prompt: null,
    cloze_fit_set: null,
    bounce_gloss: null,
    fit_set_version: null,
    gen_model: "test",
    gen_spec_version: "test",
  };
}

function makeDeps(pool: string[], carded: string[] = []): {
  deps: ReadPlacementSlateDeps;
  calls: { exclude: ReadonlySet<string>; count: number }[];
} {
  const calls: { exclude: ReadonlySet<string>; count: number }[] = [];
  const wordSource: WordSource = {
    nextFrontierWords: async (_band, exclude, count) => {
      calls.push({ exclude, count });
      return pool.filter((s) => !exclude.has(s)).slice(0, count);
    },
  };
  const catalog: Catalog = { get: (id) => makeItem(id) };
  const cards: CardRepository = {
    load: async () => undefined,
    save: async () => {},
    appendReviewLog: async () => {},
    logsForWord: async () => [],
    listCards: async () =>
      carded.map((s): Card => ({ userId: "u1", senseId: s, mastery: "Seen", fsrs: {} as never })),
  };
  return { deps: { wordSource, catalog, cards }, calls };
}

describe("readPlacementSlate", () => {
  it("SEED-2: returns count frontier candidates with display fields", async () => {
    const { deps } = makeDeps(["w1", "w2", "w3"]);
    const slate = await readPlacementSlate({ userId: "u1", frontierBand: "B2", count: 2 }, deps);
    expect(slate).toEqual([
      { senseId: "w1", lemma: "lemma-w1", pos: "verb", cefr: "B2" },
      { senseId: "w2", lemma: "lemma-w2", pos: "verb", cefr: "B2" },
    ]);
  });

  it("SEED-7: excludes words the user already has a card for", async () => {
    const { deps, calls } = makeDeps(["w1", "w2", "w3"], ["w1"]);
    const slate = await readPlacementSlate({ userId: "u1", frontierBand: "B2", count: 3 }, deps);
    expect(calls[0]?.exclude.has("w1")).toBe(true);
    expect(slate.some((w) => w.senseId === "w1")).toBe(false);
  });
});
