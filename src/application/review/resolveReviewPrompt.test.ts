import { describe, it, expect } from "vitest";
import {
  resolveReviewPrompt,
  type ResolveReviewPromptDeps,
} from "./resolveReviewPrompt.js";
import type { Card, FsrsCardState, MasteryState } from "../../domain/mastery/card.js";
import type { LexicalItem } from "../../domain/lexicalItem.js";
import type { ReviewLog } from "../../domain/review/review.js";
import type { Catalog } from "../ports/catalog.js";
import type { CardRepository } from "../ports/cardRepository.js";

function fsrs(): FsrsCardState {
  return {
    due: new Date("2026-07-02T00:00:00Z"),
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0,
  };
}

function makeItem(over: Partial<LexicalItem> = {}): LexicalItem {
  return {
    word: "abandon",
    lemma: "abandon",
    part_of_speech: "verb",
    sense_id: "abandon_verb_01",
    cefr: "B2",
    zipf: 4.0,
    zipf_rank: 1000,
    intended_sense: null,
    recognition_meaning: "to give up completely",
    distractors: ["adopt", "retain", "pursue"],
    clozed_sentence: "They had to _ the sinking ship.",
    productive_meaning: "to leave something behind for good",
    model_sentence: "They abandon the plan.",
    self_reference_prompt: "When did you last abandon a goal?",
    gen_model: "test",
    gen_spec_version: "test",
    ...over,
  };
}

/** A repo holding one card at `mastery` for (u1, senseId), plus optional logs for Seen routing. */
function makeDeps(
  mastery: MasteryState,
  logs: ReviewLog[] = [],
  item: LexicalItem = makeItem(),
): ResolveReviewPromptDeps {
  const card: Card = { userId: "u1", senseId: item.sense_id, mastery, fsrs: fsrs() };
  const cards: CardRepository = {
    load: async (u, s) => (u === "u1" && s === item.sense_id ? card : undefined),
    save: async () => {},
    appendReviewLog: async () => {},
    logsForWord: async () => logs,
    listCards: async () => [card],
  };
  const catalog: Catalog = { get: (id) => (id === item.sense_id ? item : undefined) };
  return { catalog, cards };
}

const senseId = "abandon_verb_01";

function recognitionPass(): ReviewLog {
  return {
    userId: "u1",
    senseId,
    tier: "recognition",
    rating: "Good",
    reviewedAt: new Date("2026-07-01T00:00:00Z"),
    fsrs: {
      rating: 3,
      state: 0,
      due: new Date(0),
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      last_elapsed_days: 0,
      scheduled_days: 0,
      review: new Date(0),
    },
  };
}

describe("resolveReviewPrompt (the read-model the UI renders before a response)", () => {
  it("TIER-2: a fresh Seen word resolves the recognition MCQ — meaning + options incl. the target", async () => {
    const prompt = await resolveReviewPrompt({ userId: "u1", senseId }, makeDeps("Seen"));
    expect(prompt.tier).toBe("recognition");
    if (prompt.tier === "recognition") {
      expect(prompt.meaning).toBe("to give up completely");
      expect(prompt.options).toContain("abandon"); // the correct answer is among the options
      expect(prompt.options).toEqual(expect.arrayContaining(["adopt", "retain", "pursue"]));
      expect(prompt.options).toHaveLength(4); // target + 3 distractors
    }
  });

  it("TIER-2: recognition options are de-duplicated to a stable set (no leak via ordering assumptions)", async () => {
    const prompt = await resolveReviewPrompt({ userId: "u1", senseId }, makeDeps("Seen"));
    if (prompt.tier === "recognition") {
      expect(new Set(prompt.options).size).toBe(prompt.options.length);
    }
  });

  it("SM-3: a Seen word past its MCQ pass resolves the cloze sentence", async () => {
    const prompt = await resolveReviewPrompt(
      { userId: "u1", senseId },
      makeDeps("Seen", [recognitionPass()]),
    );
    expect(prompt.tier).toBe("cloze");
    if (prompt.tier === "cloze") {
      expect(prompt.clozedSentence).toBe("They had to _ the sinking ship.");
    }
  });

  it("SM-1: a Recognized word resolves the cued prompt (the productive gloss)", async () => {
    const prompt = await resolveReviewPrompt({ userId: "u1", senseId }, makeDeps("Recognized"));
    expect(prompt.tier).toBe("cued");
    if (prompt.tier === "cued") {
      expect(prompt.meaning).toBe("to leave something behind for good");
    }
  });

  it("SM-1: a Productive word resolves the free-production prompt, revealing the target word", async () => {
    const prompt = await resolveReviewPrompt({ userId: "u1", senseId }, makeDeps("Productive"));
    expect(prompt.tier).toBe("free");
    if (prompt.tier === "free") {
      expect(prompt.lemma).toBe("abandon"); // free production reveals the word to use
      expect(prompt.pos).toBe("verb");
      expect(prompt.mastery).toBe("Productive");
    }
  });

  it("DM-2: every arm carries the part of speech (the dictionary-entry masthead renders it)", async () => {
    const seen = await resolveReviewPrompt({ userId: "u1", senseId }, makeDeps("Seen"));
    const cloze = await resolveReviewPrompt(
      { userId: "u1", senseId },
      makeDeps("Seen", [recognitionPass()]),
    );
    const cued = await resolveReviewPrompt({ userId: "u1", senseId }, makeDeps("Recognized"));
    const free = await resolveReviewPrompt({ userId: "u1", senseId }, makeDeps("Productive"));
    expect([seen.pos, cloze.pos, cued.pos, free.pos]).toEqual(["verb", "verb", "verb", "verb"]);
  });

  it("DM-2: free production carries the intended sense verbatim", async () => {
    const deps = makeDeps("Productive", [], makeItem({ intended_sense: "to give up on entirely" }));
    const prompt = await resolveReviewPrompt({ userId: "u1", senseId }, deps);
    if (prompt.tier === "free") expect(prompt.intendedSense).toBe("to give up on entirely");
  });

  it("DM-4: a missing intended sense is tolerated (the free tier renders without it)", async () => {
    const prompt = await resolveReviewPrompt({ userId: "u1", senseId }, makeDeps("Productive"));
    if (prompt.tier === "free") expect(prompt.intendedSense).toBeNull();
  });

  it("carries the pre-review mastery on every arm (for the tier sub-label)", async () => {
    const prompt = await resolveReviewPrompt({ userId: "u1", senseId }, makeDeps("Recognized"));
    expect(prompt.mastery).toBe("Recognized");
  });

  it("fails loud when a field the resolved tier needs is missing (halt, don't guess)", async () => {
    const deps = makeDeps("Seen", [], makeItem({ recognition_meaning: null }));
    await expect(resolveReviewPrompt({ userId: "u1", senseId }, deps)).rejects.toThrow();
  });

  it("throws for a senseId with no card (the queue only surfaces existing cards)", async () => {
    await expect(
      resolveReviewPrompt({ userId: "u1", senseId: "missing_01" }, makeDeps("Seen")),
    ).rejects.toThrow();
  });
});
