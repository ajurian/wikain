import { describe, it, expect } from "vitest";
import {
  reviewWasRated,
  runReviewPass,
  type RunReviewPassDeps,
  type RunReviewPassResult,
} from "./runReviewPass.js";
import type { Card, FsrsCardState, MasteryState } from "~/domain/mastery/card.js";
import type { LexicalItem } from "~/domain/lexicalItem.js";
import type { NlpToken } from "~/domain/review/ruleLayer.js";
import type { FsrsReviewLog, ReviewLog } from "~/domain/review/review.js";
import type { Rating } from "~/domain/review/rating.js";
import type { Catalog } from "../ports/catalog.js";
import type { CardRepository } from "../ports/cardRepository.js";
import type { SentenceAnalyzer } from "../ports/sentenceAnalyzer.js";
import { FakeJudge, passingVerdict } from "~/infrastructure/judge/fakeJudge.js";
import { JudgeUnavailableError } from "../ports/judge.js";
import type { Scheduler } from "../ports/scheduler.js";
import type { MemoVersions } from "../ports/verdictMemo.js";

const TEST_VERSIONS: MemoVersions = { modelVersion: "test", rubricVersion: "test" };

const NOW = new Date("2026-06-30T00:00:00Z");
const SENSE = "negotiate_verb_01";
const PASS_RESPONSE = "she negotiate a better contract price yesterday"; // word present + healthy
const ABSENT_RESPONSE = "she bought a house yesterday"; // target lemma absent → rule-layer bounce

function makeItem(): LexicalItem {
  return {
    word: "negotiate",
    lemma: "negotiate",
    part_of_speech: "verb",
    sense_id: SENSE,
    cefr: "B1",
    zipf: 4.0,
    zipf_rank: 1000,
    intended_sense: "to reach agreement by discussion",
    recognition_meaning: null,
    distractors: null,
    clozed_sentence: null,
    productive_meaning: "to reach an agreement by discussion",
    model_sentence: null,
    self_reference_prompt: null,
    cloze_fit_set: null,
    bounce_gloss: null,
    fit_set_version: null,
    gen_model: "test",
    gen_spec_version: "test",
  };
}

const catalog: Catalog = { get: (id) => (id === SENSE ? makeItem() : undefined) };

const POS: Readonly<Record<string, string>> = {
  she: "PRON",
  a: "DET",
  negotiate: "VERB",
  negotiated: "VERB",
  bought: "VERB",
  made: "VERB",
  better: "ADJ",
  contract: "NOUN",
  price: "NOUN",
  house: "NOUN",
  yesterday: "ADV",
};
const LEMMAS: Readonly<Record<string, string>> = {
  negotiated: "negotiate",
  bought: "buy",
  made: "make",
};
const STOPWORDS: ReadonlySet<string> = new Set(["she", "a"]);

/**
 * A text-DRIVEN analyzer. It must be: RL-2 presence (`formsOf`) is now derived from these very tokens,
 * so a fixed token set would smuggle the target into every response and "absent" could never bounce.
 */
const healthyAnalyzer: SentenceAnalyzer = {
  analyze: (text: string): Promise<NlpToken[]> =>
    Promise.resolve(
      text
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => ({
          normal: w,
          lemma: LEMMAS[w] ?? w,
          pos: POS[w] ?? "NOUN",
          isStopword: STOPWORDS.has(w),
          isWord: true,
        })),
    ),
};

function makeFsrs(state = 2): FsrsCardState {
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
    logsForWord: async (userId, senseId) =>
      logs.filter((l) => l.userId === userId && l.senseId === senseId),
    listCards: async () => [card],
    deleteCard: async () => {},
  };
  return { cards, logs, stored: () => card };
}

function card(mastery: MasteryState): Card {
  return { userId: "u1", senseId: SENSE, mastery, fsrs: makeFsrs() };
}

function deps(
  initial: Card,
  judge: FakeJudge = new FakeJudge(passingVerdict()),
): {
  d: RunReviewPassDeps;
  judge: FakeJudge;
  calls: Rating[];
  logs: ReviewLog[];
  stored: () => Card;
} {
  const { scheduler, calls } = makeScheduler();
  const repo = makeRepo(initial);
  return {
    d: {
      catalog,
      cards: repo.cards,
      scheduler,
      analyzer: healthyAnalyzer,
      judge,
      tagalogLexicon: new Set(),
      // No-op memo stub: these tests assert routing/rating/logs, not memo caching (a fresh miss every time).
      memo: { lookup: async () => undefined, record: async () => {} },
      judgeVersions: TEST_VERSIONS,
      // No-op heal queue: the FIT-11 write path is asserted in submitCloze.test.ts, not here.
      healQueue: { record: async () => {} },
    },
    judge,
    calls,
    logs: repo.logs,
    stored: repo.stored,
  };
}

describe("runReviewPass — deterministic branch (LOOP-1, LOOP-2)", () => {
  it("LOOP-1/LOOP-2: a Recognized card routes to the cued branch, promotes, and makes no LLM call", async () => {
    const { d, judge, calls, logs, stored } = deps(card("Recognized"));

    const res = await runReviewPass(
      { userId: "u1", senseId: SENSE, response: "negotiate", now: NOW },
      d,
    );

    expect(res.tier).toBe("cued");
    if (res.tier === "cued") {
      expect(res.outcome.passed).toBe(true);
      expect(res.outcome.mastery).toBe("Productive"); // SM-4
    }
    expect(judge.calls).toHaveLength(0); // LOOP-2: no judge/LLM on the deterministic branch
    expect(calls).toEqual(["Good"]);
    expect(stored().mastery).toBe("Productive");
    // LOOP-5: a rated pass persists exactly one log.
    expect(logs).toHaveLength(1);
    expect(logs[0]?.tier).toBe("cued");
  });

  it("reports previousMastery (pre-pass state) so the UI can render an honest from → to move", async () => {
    const { d } = deps(card("Recognized"));

    const res = await runReviewPass(
      { userId: "u1", senseId: SENSE, response: "negotiate", now: NOW },
      d,
    );

    expect(res.previousMastery).toBe("Recognized"); // pre-pass
    if (res.tier === "cued") expect(res.outcome.mastery).toBe("Productive"); // post-pass
  });
});

describe("runReviewPass — Seen on-ramp (LOOP-1, SM-3, RAT-7)", () => {
  /** A prior on-ramp ReviewLog, used to move the on-ramp ledger past the MCQ step. */
  function onRampLog(tier: "recognition" | "cloze", rating: Rating): ReviewLog {
    return {
      userId: "u1",
      senseId: SENSE,
      tier,
      rating,
      reviewedAt: NOW,
      fsrs: {
        rating: rating === "Good" ? 3 : 1,
        state: 0,
        due: NOW,
        stability: 1,
        difficulty: 5,
        elapsed_days: 0,
        last_elapsed_days: 0,
        scheduled_days: 0,
        review: NOW,
      },
    };
  }

  it("SM-3: a Seen card with no history routes to the recognition MCQ; a correct pick does NOT promote (stays Seen)", async () => {
    const { d, judge, logs, stored } = deps(card("Seen"));

    const res = await runReviewPass({ userId: "u1", senseId: SENSE, response: "negotiate", now: NOW }, d);

    expect(res.tier).toBe("recognition");
    if (res.tier === "recognition") {
      expect(res.outcome.passed).toBe(true);
      expect(res.outcome.mastery).toBe("Seen"); // MCQ pass alone never promotes (SM-3)
    }
    expect(judge.calls).toHaveLength(0); // deterministic — no LLM
    expect(stored().mastery).toBe("Seen");
    expect(logs.at(-1)?.tier).toBe("recognition");
  });

  it("SM-3: after a prior MCQ pass, a Seen card routes to the cloze; a correct answer promotes Seen → Recognized", async () => {
    const { d, judge, logs, stored } = deps(card("Seen"));
    logs.push(onRampLog("recognition", "Good")); // a prior spaced MCQ pass exists

    const res = await runReviewPass({ userId: "u1", senseId: SENSE, response: "negotiate", now: NOW }, d);

    expect(res.tier).toBe("cloze");
    if (res.tier === "cloze" && res.outcome.kind === "graded") {
      expect(res.outcome.passed).toBe(true);
      expect(res.outcome.mastery).toBe("Recognized"); // SM-3: promotion fires on the cloze pass
    }
    expect(judge.calls).toHaveLength(0);
    expect(stored().mastery).toBe("Recognized");
  });

  it("RAT-7: after a prior MCQ pass and a first cloze fail, the next Seen presentation drops back to the MCQ", async () => {
    const { d, logs } = deps(card("Seen"));
    // Seeded history: MCQ pass then a first cloze fail → the next presentation drops back to the MCQ.
    logs.push(onRampLog("recognition", "Good"), onRampLog("cloze", "Again"));

    const res = await runReviewPass({ userId: "u1", senseId: SENSE, response: "negotiate", now: NOW }, d);

    expect(res.tier).toBe("recognition"); // RAT-7 drop-back
  });
});

describe("runReviewPass — judged branch (LOOP-1, LOOP-3, LOOP-4, LOOP-5)", () => {
  it("LOOP-1/LOOP-3 (INV-2): a Productive card whose response lacks the word bounces — no rating, no schedule, no log", async () => {
    const { d, judge, calls, logs, stored } = deps(card("Productive"));
    const before = stored();

    const res = await runReviewPass(
      { userId: "u1", senseId: SENSE, response: ABSENT_RESPONSE, now: NOW },
      d,
    );

    expect(res.tier).toBe("free");
    if (res.tier === "free") expect(res.outcome.kind).toBe("bounce");
    expect(judge.calls).toHaveLength(0); // RL-1: judge not reached
    expect(calls).toEqual([]); // INV-2: scheduler not called
    expect(logs).toHaveLength(0); // LOOP-5: a bounce persists nothing
    expect(stored()).toBe(before); // card untouched → stays due
  });

  it("LOOP-4: a gate-passing free production rates Good, persists one log, and stays Productive (one pass < SM-5 gate)", async () => {
    const { d, judge, calls, logs, stored } = deps(card("Productive"));

    const res = await runReviewPass(
      { userId: "u1", senseId: SENSE, response: PASS_RESPONSE, now: NOW },
      d,
    );

    expect(res.tier).toBe("free");
    if (res.tier === "free" && res.outcome.kind === "judged") {
      expect(res.outcome.passed).toBe(true);
      expect(res.outcome.rating).toBe("Good");
      expect(res.outcome.mastery).toBe("Productive");
    }
    expect(judge.calls).toHaveLength(1); // judged exactly once
    expect(calls).toEqual(["Good"]);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.tier).toBe("free");
    expect(stored().mastery).toBe("Productive");
  });

  it("LOOP-4 (SM-6/SM-7): a gate-failing free production rates Again and demotes Productive → Recognized", async () => {
    const judge = new FakeJudge(passingVerdict({ used_in_target_sense: false }));
    const { d, calls, stored } = deps(card("Productive"), judge);

    const res = await runReviewPass(
      { userId: "u1", senseId: SENSE, response: PASS_RESPONSE, now: NOW },
      d,
    );

    if (res.tier === "free" && res.outcome.kind === "judged") {
      expect(res.outcome.passed).toBe(false);
      expect(res.outcome.rating).toBe("Again");
      expect(res.outcome.mastery).toBe("Recognized");
    }
    expect(calls).toEqual(["Again"]);
    expect(stored().mastery).toBe("Recognized");
  });

  it("NET-3 (INV-2): a cloud-judge failure on the free branch surfaces 'unavailable' — no rating/schedule/log, card stays due", async () => {
    const judge = new FakeJudge(() => {
      throw new JudgeUnavailableError("transient");
    });
    const { d, calls, logs, stored } = deps(card("Productive"), judge);
    const before = stored();

    const res = await runReviewPass(
      { userId: "u1", senseId: SENSE, response: PASS_RESPONSE, now: NOW },
      d,
    );

    expect(res.tier).toBe("free");
    if (res.tier === "free") {
      expect(res.outcome.kind).toBe("unavailable");
      if (res.outcome.kind === "unavailable") expect(res.outcome.reason).toBe("transient");
    }
    expect(judge.calls).toHaveLength(1); // the judge WAS reached (rule layer passed)
    expect(calls).toEqual([]); // scheduler not called
    expect(logs).toHaveLength(0); // no ReviewLog
    expect(stored()).toBe(before); // card untouched → stays due
  });

  it("SM-1/SM-6: a Fluent card runs the judged maintenance branch; a gate fail demotes Fluent → Productive", async () => {
    const judge = new FakeJudge(passingVerdict({ used_in_target_sense: false }));
    const { d, stored } = deps(card("Fluent"), judge);

    const res = await runReviewPass(
      { userId: "u1", senseId: SENSE, response: PASS_RESPONSE, now: NOW },
      d,
    );

    expect(res.tier).toBe("free");
    if (res.tier === "free" && res.outcome.kind === "judged") {
      expect(res.outcome.mastery).toBe("Productive");
    }
    expect(stored().mastery).toBe("Productive");
  });
});

describe("reviewWasRated (BAT-7)", () => {
  it("BAT-7: true for a rated deterministic pass — and a ReviewLog was indeed written", async () => {
    const { d, logs } = deps(card("Recognized"));
    const res = await runReviewPass(
      { userId: "u1", senseId: SENSE, response: "negotiate", now: NOW },
      d,
    );
    expect(reviewWasRated(res)).toBe(true);
    expect(logs).toHaveLength(1);
  });

  it("BAT-7: true for a judged verdict — one log written", async () => {
    const { d, logs } = deps(card("Productive"));
    const res = await runReviewPass(
      { userId: "u1", senseId: SENSE, response: PASS_RESPONSE, now: NOW },
      d,
    );
    expect(reviewWasRated(res)).toBe(true);
    expect(logs).toHaveLength(1);
  });

  it("BAT-7: false for a rule-layer bounce — no log written (INV-2)", async () => {
    const { d, logs } = deps(card("Productive"));
    const res = await runReviewPass(
      { userId: "u1", senseId: SENSE, response: ABSENT_RESPONSE, now: NOW },
      d,
    );
    expect(reviewWasRated(res)).toBe(false);
    expect(logs).toHaveLength(0);
  });

  it("BAT-7: false for the cloze soft bounce; true for a graded cloze lane", () => {
    const soft = {
      tier: "cloze",
      previousMastery: "Seen",
      outcome: { kind: "softBounce" },
    } as unknown as RunReviewPassResult;
    const graded = {
      tier: "cloze",
      previousMastery: "Seen",
      outcome: { kind: "graded" },
    } as unknown as RunReviewPassResult;
    expect(reviewWasRated(soft)).toBe(false);
    expect(reviewWasRated(graded)).toBe(true);
  });

  it("BAT-7: false for a judge-unavailable outcome — no log written (NET-3)", () => {
    const unavailable = {
      tier: "free",
      previousMastery: "Productive",
      outcome: { kind: "unavailable", reason: "transient" },
    } as unknown as RunReviewPassResult;
    expect(reviewWasRated(unavailable)).toBe(false);
  });
});
