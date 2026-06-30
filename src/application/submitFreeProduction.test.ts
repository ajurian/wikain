import { describe, it, expect } from "vitest";
import {
  submitFreeProduction,
  type SubmitFreeProductionDeps,
} from "./submitFreeProduction.js";
import type { Card, FsrsCardState, MasteryState } from "../domain/card.js";
import type { LexicalItem } from "../domain/lexicalItem.js";
import type { NlpToken } from "../domain/ruleLayer.js";
import type { JudgeVerdict } from "../domain/verdict.js";
import type { FsrsReviewLog, ReviewLog } from "../domain/review.js";
import type { Rating } from "../domain/rating.js";
import type { Catalog } from "./ports/catalog.js";
import type { CardRepository } from "./ports/cardRepository.js";
import type { Lemmatizer } from "./ports/lemmatizer.js";
import type { SentenceAnalyzer } from "./ports/sentenceAnalyzer.js";
import type { JudgePort, JudgeRequest } from "./ports/judge.js";
import type { Scheduler } from "./ports/scheduler.js";
import { MAX_RULE_BOUNCE_RETRIES } from "../domain/constants.js";

const NOW = new Date("2026-06-30T00:00:00Z");
const SENSE = "negotiate_verb_01";

function makeItem(): LexicalItem {
  return {
    word: "negotiate",
    lemma: "negotiate",
    part_of_speech: "verb",
    sense_id: SENSE,
    sense_hint: null,
    cefr: "B1",
    list_rank: null,
    band: "B1",
    source: "oxford",
    intended_sense: "to reach agreement by discussion",
    recognition_meaning: null,
    distractors: null,
    clozed_sentence: null,
    productive_meaning: "to reach an agreement by discussion",
    model_sentence: null, // null → no verbatim-similarity check (DM-4)
    self_reference_prompt: null,
    gen_model: "test",
    gen_spec_version: "test",
  };
}

const catalog: Catalog = { get: (id) => (id === SENSE ? makeItem() : undefined) };

/** Naive forms: lowercase split. A response literally containing "negotiate" is present (RL-2). */
const lemmatizer: Lemmatizer = {
  formsOf: (text) => text.toLowerCase().split(/\s+/).filter(Boolean),
};

/** A healthy, non-degenerate token set (≥4 non-target content tokens + a VERB) for any text. */
const healthyAnalyzer: SentenceAnalyzer = {
  analyze: (): NlpToken[] => [
    { normal: "she", lemma: "she", pos: "PRON", isStopword: true, isWord: true },
    { normal: "negotiated", lemma: "negotiate", pos: "VERB", isStopword: false, isWord: true },
    { normal: "better", lemma: "better", pos: "ADJ", isStopword: false, isWord: true },
    { normal: "contract", lemma: "contract", pos: "NOUN", isStopword: false, isWord: true },
    { normal: "price", lemma: "price", pos: "NOUN", isStopword: false, isWord: true },
    { normal: "yesterday", lemma: "yesterday", pos: "ADV", isStopword: false, isWord: true },
  ],
};

function verdict(overrides: Partial<JudgeVerdict> = {}): JudgeVerdict {
  return {
    used_in_target_sense: true,
    detected_sense: "to reach agreement by discussion",
    intended_sense: "to reach agreement by discussion",
    grammatical: true,
    collocation_natural: true,
    register_fit: "ok",
    replacements: [],
    corrected_sentence: "",
    enrichment_suggestion: null,
    one_line_feedback: "",
    ...overrides,
  };
}

class RecordingJudge implements JudgePort {
  readonly calls: JudgeRequest[] = [];
  constructor(private readonly reply: JudgeVerdict) {}
  async judge(request: JudgeRequest): Promise<JudgeVerdict> {
    this.calls.push(request);
    return this.reply;
  }
}

function makeFsrs(): FsrsCardState {
  return {
    due: NOW,
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 1,
    lapses: 0,
    state: 2,
  };
}

function makeScheduler(): { scheduler: Scheduler; calls: Rating[] } {
  const calls: Rating[] = [];
  const scheduler: Scheduler = {
    newCard: () => makeFsrs(),
    next: (card, rating, now) => {
      calls.push(rating);
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
      return { card: { ...card, due: new Date(now.getTime() + 86_400_000) }, log };
    },
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
  };
  return { cards, logs, stored: () => card };
}

function productiveCard(): Card {
  return { userId: "u1", senseId: SENSE, mastery: "Productive", fsrs: makeFsrs() };
}

function deps(
  card: Card,
  judge: JudgePort,
  analyzer: SentenceAnalyzer = healthyAnalyzer,
  tagalogLexicon: ReadonlySet<string> = new Set(),
): { d: SubmitFreeProductionDeps; calls: Rating[]; logs: ReviewLog[]; stored: () => Card } {
  const { scheduler, calls } = makeScheduler();
  const repo = makeRepo(card);
  return {
    d: { catalog, cards: repo.cards, scheduler, lemmatizer, analyzer, judge, tagalogLexicon },
    calls,
    logs: repo.logs,
    stored: repo.stored,
  };
}

describe("submitFreeProduction — rule-layer bounce (INV-2)", () => {
  it("INV-2: a word-absent submission derives no rating, never schedules, never logs, card stays due", async () => {
    const judge = new RecordingJudge(verdict());
    const { d, calls, logs, stored } = deps(productiveCard(), judge);
    const before = stored();

    const res = await submitFreeProduction(
      { userId: "u1", senseId: SENSE, response: "she bought a house", now: NOW },
      d,
    );

    expect(res.kind).toBe("bounce");
    if (res.kind === "bounce") expect(res.reason).toBe("absent");
    expect(calls).toEqual([]); // scheduler.next NOT invoked
    expect(logs).toHaveLength(0); // no ReviewLog
    expect(judge.calls).toHaveLength(0); // RL-1: judge not reached
    expect(stored()).toBe(before); // card untouched → stays due
  });

  it("RL-6: reaching MAX_RULE_BOUNCE_RETRIES reveals the model sentence, still no rating", async () => {
    const judge = new RecordingJudge(verdict());
    const { d, calls } = deps(productiveCard(), judge);

    const res = await submitFreeProduction(
      {
        userId: "u1",
        senseId: SENSE,
        response: "she bought a house",
        priorBounces: MAX_RULE_BOUNCE_RETRIES - 1,
        now: NOW,
      },
      d,
    );

    expect(res.kind).toBe("bounce");
    if (res.kind === "bounce") {
      expect(res.bounces).toBe(MAX_RULE_BOUNCE_RETRIES);
      expect(res.revealModelSentence).toBe(true);
    }
    expect(calls).toEqual([]);
  });
});

describe("submitFreeProduction — judged path (INV-1)", () => {
  it("INV-1 / RAT-1: a gate-passing sentence rates Good exactly once and writes one ReviewLog", async () => {
    const judge = new RecordingJudge(verdict());
    const { d, calls, logs } = deps(productiveCard(), judge);

    const res = await submitFreeProduction(
      { userId: "u1", senseId: SENSE, response: "she negotiate a better contract price", now: NOW },
      d,
    );

    expect(res.kind).toBe("judged");
    if (res.kind === "judged") {
      expect(res.passed).toBe(true);
      expect(res.rating).toBe("Good");
    }
    expect(judge.calls).toHaveLength(1); // judged once (no rejudge — RAT-4)
    expect(calls).toEqual(["Good"]);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.tier).toBe("free");
    expect(logs[0]?.scaffolded).toBe(false); // RAT-5 instrumented
  });

  it("a gate pass leaves mastery at Productive (SM-5 Fluent promotion is a later slice)", async () => {
    const judge = new RecordingJudge(verdict());
    const { d, stored } = deps(productiveCard(), judge);

    const res = await submitFreeProduction(
      { userId: "u1", senseId: SENSE, response: "she negotiate a better contract price", now: NOW },
      d,
    );

    if (res.kind === "judged") expect(res.mastery).toBe("Productive");
    expect(stored().mastery).toBe("Productive");
  });

  it("SM-6 / SM-7: a sense-gate fail rates Again and demotes Productive → Recognized", async () => {
    const judge = new RecordingJudge(verdict({ used_in_target_sense: false }));
    const { d, calls, logs, stored } = deps(productiveCard(), judge);

    const res = await submitFreeProduction(
      { userId: "u1", senseId: SENSE, response: "she negotiate a better contract price", now: NOW },
      d,
    );

    expect(res.kind).toBe("judged");
    if (res.kind === "judged") {
      expect(res.passed).toBe(false);
      expect(res.rating).toBe("Again");
      expect(res.mastery).toBe("Recognized");
    }
    expect(calls).toEqual(["Again"]); // one rating only
    expect(logs).toHaveLength(1);
    expect(stored().mastery).toBe("Recognized");
  });

  it("INV-3: the judged mastery transition is independent of the FSRS internal state", async () => {
    const outcomes: MasteryState[] = [];
    for (const fsrsState of [1, 2, 3]) {
      const card: Card = {
        userId: "u1",
        senseId: SENSE,
        mastery: "Productive",
        fsrs: { ...makeFsrs(), state: fsrsState },
      };
      const judge = new RecordingJudge(verdict({ used_in_target_sense: false }));
      const { d } = deps(card, judge);
      const res = await submitFreeProduction(
        { userId: "u1", senseId: SENSE, response: "she negotiate a better contract price", now: NOW },
        d,
      );
      if (res.kind === "judged") outcomes.push(res.mastery);
    }
    expect(outcomes).toEqual(["Recognized", "Recognized", "Recognized"]);
  });
});
