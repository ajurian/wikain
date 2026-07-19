import { describe, it, expect } from "vitest";
import {
  submitCloze,
  type ClozeSoftBounceResult,
  type SubmitClozeDeps,
  type SubmitClozeResult,
} from "./submitCloze.js";
import type { Card, FsrsCardState } from "~/domain/mastery/card.js";
import type { LexicalItem } from "~/domain/lexicalItem.js";
import type { FsrsReviewLog, ReviewLog } from "~/domain/review/review.js";
import type { Rating } from "~/domain/review/rating.js";
import type { Catalog } from "../ports/catalog.js";
import type { CardRepository } from "../ports/cardRepository.js";
import type { HealQueueEntry, HealQueuePort } from "../ports/healQueue.js";
import type { SentenceAnalyzer } from "../ports/sentenceAnalyzer.js";
import type { Scheduler } from "../ports/scheduler.js";

const NOW = new Date("2026-07-01T00:00:00Z");
const SENSE = "negotiate_verb_01";
const GLOSS = "to talk something through in order to reach a deal";

function makeItem(overrides: Partial<LexicalItem> = {}): LexicalItem {
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
    cloze_fit_set: [
      { lemma: "negotiate", class: "target" },
      { lemma: "bargain", class: "same_sense_near_miss" },
      { lemma: "discuss", class: "different_sense_fit" },
    ],
    bounce_gloss: GLOSS,
    fit_set_version: 1,
    gen_model: "test",
    gen_spec_version: "test",
    ...overrides,
  };
}

function makeCatalog(item: LexicalItem): Catalog {
  return { get: (id) => (id === SENSE ? item : undefined) };
}

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
    deleteCard: async () => {},
  };
  return { cards, logs, stored: () => card };
}

function seenCard(): Card {
  return { userId: "u1", senseId: SENSE, mastery: "Seen", fsrs: makeFsrs(1) };
}

function deps(
  card: Card,
  item: LexicalItem = makeItem(),
): {
  d: SubmitClozeDeps;
  calls: Rating[];
  logs: ReviewLog[];
  healed: HealQueueEntry[];
  stored: () => Card;
} {
  const { scheduler, calls } = makeScheduler();
  const repo = makeRepo(card);
  const healed: HealQueueEntry[] = [];
  const healQueue: HealQueuePort = {
    record: async (entry) => {
      healed.push(entry);
    },
  };
  return {
    d: { catalog: makeCatalog(item), cards: repo.cards, scheduler, analyzer, healQueue },
    calls,
    logs: repo.logs,
    healed,
    stored: repo.stored,
  };
}

function graded(res: SubmitClozeResult) {
  if (res.kind !== "graded") throw new Error(`expected a graded result, got ${res.kind}`);
  return res;
}

function softBounce(res: SubmitClozeResult): ClozeSoftBounceResult {
  if (res.kind !== "softBounce") throw new Error(`expected a soft bounce, got ${res.kind}`);
  return res;
}

describe("submitCloze (Seen typed cloze)", () => {
  it("TIER-5 / SM-3: a correct cloze answer grades Good and promotes Seen → Recognized", async () => {
    const { d, calls, stored } = deps(seenCard());
    const res = graded(
      await submitCloze({ userId: "u1", senseId: SENSE, response: "negotiate", now: NOW }, d),
    );
    expect(res.passed).toBe(true);
    expect(res.rating).toBe("Good");
    expect(calls).toEqual(["Good"]);
    expect(res.mastery).toBe("Recognized"); // SM-3: promotion fires on the cloze pass
    expect(stored().mastery).toBe("Recognized");
  });

  it("RAT-1 / SM-6: a wrong-path answer rates Again, reschedules, and does NOT demote (stays Seen)", async () => {
    const { d, calls, stored } = deps(seenCard());
    const res = graded(
      await submitCloze({ userId: "u1", senseId: SENSE, response: "surrender", now: NOW }, d),
    );
    expect(res.passed).toBe(false);
    expect(res.rating).toBe("Again");
    expect(calls).toEqual(["Again"]);
    expect(res.mastery).toBe("Seen");
    expect(stored().mastery).toBe("Seen");
  });

  it("RAT-8: exactly one ReviewLog tagged 'cloze' is persisted on a graded outcome", async () => {
    const { d, logs } = deps(seenCard());
    await submitCloze({ userId: "u1", senseId: SENSE, response: "negotiate", now: NOW }, d);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.tier).toBe("cloze");
  });

  it("FIT-6 / FIT-7: a same-sense near-miss soft-bounces — no rating, no log, card untouched", async () => {
    const { d, calls, logs, stored } = deps(seenCard());
    const res = softBounce(
      await submitCloze({ userId: "u1", senseId: SENSE, response: "bargain", now: NOW }, d),
    );
    expect(res.lane).toBe("same_sense_near_miss");
    expect(res.bounces).toBe(1);
    expect(res.hintPrefix).toBe("n");
    expect(res.gloss).toBeNull();
    // FIT-7: no scheduler call, no ReviewLog, the card stays as it was (still due).
    expect(calls).toEqual([]);
    expect(logs).toHaveLength(0);
    expect(stored()).toEqual(seenCard());
  });

  it("FIT-4: only the different-sense lane carries the bounce_gloss", async () => {
    const { d } = deps(seenCard());
    const res = softBounce(
      await submitCloze({ userId: "u1", senseId: SENSE, response: "discuss", now: NOW }, d),
    );
    expect(res.lane).toBe("different_sense_fit");
    expect(res.gloss).toBe(GLOSS);
  });

  it("FIT-7: soft bounces accumulate via priorSoftBounces (stateless use-case)", async () => {
    const { d } = deps(seenCard());
    const res = softBounce(
      await submitCloze(
        { userId: "u1", senseId: SENSE, response: "bargain", priorSoftBounces: 1, now: NOW },
        d,
      ),
    );
    expect(res.bounces).toBe(2);
  });

  it("FIT-8: a soft lane AT the cap grades Again instead of bouncing, recording the full history", async () => {
    const { d, calls, logs } = deps(seenCard());
    const res = graded(
      await submitCloze(
        {
          userId: "u1",
          senseId: SENSE,
          response: "bargain",
          priorSoftBounces: 2,
          priorSoftBounceLanes: ["same_sense_near_miss", "different_sense_fit"],
          now: NOW,
        },
        d,
      ),
    );
    expect(res.passed).toBe(false);
    expect(res.rating).toBe("Again");
    expect(calls).toEqual(["Again"]);
    // FIT-10: the single log carries the whole presentation's bounce history, capped lane included.
    expect(logs).toHaveLength(1);
    expect(logs[0]?.softBounceCount).toBe(3);
    expect(logs[0]?.softBounceLanes).toEqual([
      "same_sense_near_miss",
      "different_sense_fit",
      "same_sense_near_miss",
    ]);
  });

  it("FIT-9: a DL≤1 typo of the target grades Good with typoFixed recorded", async () => {
    const { d, calls, logs } = deps(seenCard());
    const res = graded(
      await submitCloze({ userId: "u1", senseId: SENSE, response: "negotiat", now: NOW }, d),
    );
    expect(res.passed).toBe(true);
    expect(res.rating).toBe("Good");
    expect(calls).toEqual(["Good"]);
    expect(logs[0]?.typoFixed).toBe(true);
  });

  it("FIT-10: a converted pass within the cap records the accrued bounce history on its log", async () => {
    const { d, logs } = deps(seenCard());
    const res = graded(
      await submitCloze(
        {
          userId: "u1",
          senseId: SENSE,
          response: "negotiate",
          priorSoftBounces: 1,
          priorSoftBounceLanes: ["same_sense_near_miss"],
          now: NOW,
        },
        d,
      ),
    );
    expect(res.rating).toBe("Good");
    expect(logs[0]?.softBounceCount).toBe(1);
    expect(logs[0]?.softBounceLanes).toEqual(["same_sense_near_miss"]);
    expect(logs[0]?.typoFixed).toBe(false);
  });

  it("FIT-10: a clean first-try pass records an honest zero, not an absent signal", async () => {
    const { d, logs } = deps(seenCard());
    await submitCloze({ userId: "u1", senseId: SENSE, response: "negotiate", now: NOW }, d);
    expect(logs[0]?.softBounceCount).toBe(0);
    expect(logs[0]?.softBounceLanes).toEqual([]);
  });

  it("FIT-11: a wrong-path single plausible word is recorded to the heal queue (anonymous)", async () => {
    const { d, healed } = deps(seenCard());
    await submitCloze({ userId: "u1", senseId: SENSE, response: "surrender", now: NOW }, d);
    expect(healed).toEqual([
      {
        senseId: SENSE,
        typedLemma: "surrender",
        clozedSentence: "The two sides met to _ a ceasefire.",
      },
    ]);
    // Anonymous by construction: the entry shape carries no user identity at all.
    expect(Object.keys(healed[0] ?? {})).not.toContain("userId");
  });

  it("FIT-11: a multi-word wrong response is not a heal candidate", async () => {
    const { d, healed } = deps(seenCard());
    const res = graded(
      await submitCloze({ userId: "u1", senseId: SENSE, response: "give up", now: NOW }, d),
    );
    expect(res.rating).toBe("Again");
    expect(healed).toHaveLength(0);
  });

  it("FIT-11: a capped soft lane never writes the heal queue — that word IS in the fit set", async () => {
    const { d, healed } = deps(seenCard());
    await submitCloze(
      { userId: "u1", senseId: SENSE, response: "bargain", priorSoftBounces: 2, now: NOW },
      d,
    );
    expect(healed).toHaveLength(0);
  });

  it("FIT-6: a pre-fit-set item (null cloze_fit_set) degrades to target/typo/wrong only", async () => {
    const item = makeItem({ cloze_fit_set: null, bounce_gloss: null, fit_set_version: null });
    const { d, calls } = deps(seenCard(), item);
    const res = graded(
      await submitCloze({ userId: "u1", senseId: SENSE, response: "bargain", now: NOW }, d),
    );
    expect(res.rating).toBe("Again");
    expect(calls).toEqual(["Again"]);
  });
});
