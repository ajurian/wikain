import { describe, it, expect } from "vitest";
import {
  submitCuedReview,
  type SubmitCuedReviewDeps,
  type SubmitCuedReviewResult,
} from "./submitCuedReview.js";
import type { Card, FsrsCardState, MasteryState } from "~/domain/mastery/card.js";
import type { LexicalItem } from "~/domain/lexicalItem.js";
import type { FsrsReviewLog, ReviewLog } from "~/domain/review/review.js";
import type { Rating } from "~/domain/review/rating.js";
import type { Catalog } from "../ports/catalog.js";
import type { CardRepository } from "../ports/cardRepository.js";
import type { SentenceAnalyzer } from "../ports/sentenceAnalyzer.js";
import type { Scheduler } from "../ports/scheduler.js";

const NOW = new Date("2026-06-30T00:00:00Z");
const SENSE = "negotiate_verb_01";

function makeItem(synonyms: string[] | null = null): LexicalItem {
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
    cloze_fit_set: null,
    bounce_gloss: null,
    cued_valid_synonyms: synonyms,
    fit_set_version: null,
    gen_model: "test",
    gen_spec_version: "test",
  };
}

/** Default catalog carries no synonym set; `depsWith(synonyms)` supplies one for the CUE-5.2 tests. */
const catalog: Catalog = {
  get: (id) => (id === SENSE ? makeItem() : undefined),
};

/** CUE-1 fixture: "bargain"/"haggle" are same-sense synonyms of "negotiate". */
const SYNONYMS = ["bargain", "haggle"];
const catalogWithSynonyms: Catalog = {
  get: (id) => (id === SENSE ? makeItem(SYNONYMS) : undefined),
};

/** A fake that lowercases and splits — the match is controlled by what `response` is fed. */
const analyzer: SentenceAnalyzer = {
  analyze: (text: string) =>
    Promise.resolve(
      text
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => ({ normal: w, lemma: w, pos: "NOUN", isStopword: false, isWord: true })),
    ),
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
    deleteCard: async () => {},
  };
  return { cards, logs, stored: () => card };
}

function recognizedCard(state = 1): Card {
  return { userId: "u1", senseId: SENSE, mastery: "Recognized", fsrs: makeFsrs(state) };
}

function deps(card: Card, cat: Catalog = catalog): {
  d: SubmitCuedReviewDeps;
  calls: Rating[];
  logs: ReviewLog[];
  stored: () => Card;
} {
  const { scheduler, calls } = makeScheduler();
  const repo = makeRepo(card);
  return {
    d: { catalog: cat, cards: repo.cards, scheduler, analyzer },
    calls,
    logs: repo.logs,
    stored: repo.stored,
  };
}

/** Narrow the union to the graded arm — every graded-path test asserts it produced a rating. */
function graded(res: SubmitCuedReviewResult) {
  if (res.kind !== "graded") throw new Error(`expected a graded result, got ${res.kind}`);
  return res;
}

describe("submitCuedReview", () => {
  it("RAT-1: a correct cued response rates Good and schedules with Good", async () => {
    const { d, calls } = deps(recognizedCard());
    const res = graded(
      await submitCuedReview(
        { userId: "u1", senseId: SENSE, response: "negotiate", now: NOW },
        d,
      ),
    );
    expect(res.passed).toBe(true);
    expect(res.rating).toBe("Good");
    expect(calls).toEqual(["Good"]);
  });

  it("BAT-15: a measured duration is recorded on the log; an unmeasured one stays absent", async () => {
    const measured = deps(recognizedCard());
    await submitCuedReview(
      { userId: "u1", senseId: SENSE, response: "negotiate", durationMs: 18000, now: NOW },
      measured.d,
    );
    expect(measured.logs[0]!.durationMs).toBe(18000);

    const unmeasured = deps(recognizedCard());
    await submitCuedReview({ userId: "u1", senseId: SENSE, response: "negotiate", now: NOW }, unmeasured.d);
    expect(unmeasured.logs[0]!.durationMs).toBeUndefined();
  });

  it("SM-4: a cued pass promotes Recognized → Productive", async () => {
    const { d, stored } = deps(recognizedCard());
    const res = graded(
      await submitCuedReview(
        { userId: "u1", senseId: SENSE, response: "negotiate", now: NOW },
        d,
      ),
    );
    expect(res.mastery).toBe("Productive");
    expect(stored().mastery).toBe("Productive");
  });

  it("RAT-1 + SM-6: a wrong cued response rates Again, reschedules, and does NOT demote", async () => {
    const { d, calls, stored } = deps(recognizedCard());
    const res = graded(
      await submitCuedReview(
        { userId: "u1", senseId: SENSE, response: "banana", now: NOW },
        d,
      ),
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
      const res = graded(
        await submitCuedReview(
          { userId: "u1", senseId: SENSE, response: "negotiate", now: NOW },
          d,
        ),
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

  it("CUE-5.1: a response within DL 1 of the target rates Good with typoFixed recorded", async () => {
    const { d, calls, logs } = deps(recognizedCard());
    const res = graded(
      await submitCuedReview(
        { userId: "u1", senseId: SENSE, response: "negotiat", now: NOW },
        d,
      ),
    );
    expect(res.passed).toBe(true);
    expect(res.rating).toBe("Good");
    expect(calls).toEqual(["Good"]);
    expect(logs[0]?.typoFixed).toBe(true);
  });

  it("CUE-6: a valid synonym soft-bounces — no rating, no scheduler call, no ReviewLog", async () => {
    const { d, calls, logs, stored } = deps(recognizedCard(), catalogWithSynonyms);
    const res = await submitCuedReview(
      { userId: "u1", senseId: SENSE, response: "bargain", now: NOW },
      d,
    );
    expect(res.kind).toBe("softBounce");
    if (res.kind === "softBounce") {
      expect(res.bounces).toBe(1);
      expect(res.hintPrefix).toBe("n");
    }
    expect(calls).toEqual([]); // scheduler untouched
    expect(logs).toHaveLength(0); // no ReviewLog
    expect(stored().mastery).toBe("Recognized"); // no promotion (CUE-5.2)
  });

  it("CUE-7a: a synonym at the cap reveals + rates Again (no demote), recording the bounce count", async () => {
    const { d, calls, logs, stored } = deps(recognizedCard(), catalogWithSynonyms);
    const res = graded(
      await submitCuedReview(
        // CUED_SOFT_BOUNCE_CAP = 3; two prior bounces + this one hits the cap.
        { userId: "u1", senseId: SENSE, response: "haggle", priorSoftBounces: 2, now: NOW },
        d,
      ),
    );
    expect(res.passed).toBe(false);
    expect(res.rating).toBe("Again");
    expect(calls).toEqual(["Again"]);
    expect(res.mastery).toBe("Recognized"); // cued never demotes
    expect(stored().mastery).toBe("Recognized");
    expect(logs).toHaveLength(1);
    expect(logs[0]?.softBounceCount).toBe(3);
  });

  it("CUE-11: a clean cued pass records softBounceCount 0 (an honest measurement)", async () => {
    const { d, logs } = deps(recognizedCard(), catalogWithSynonyms);
    await submitCuedReview(
      { userId: "u1", senseId: SENSE, response: "negotiate", now: NOW },
      d,
    );
    expect(logs[0]?.softBounceCount).toBe(0);
  });
});
