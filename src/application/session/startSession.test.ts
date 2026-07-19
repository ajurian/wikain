import { describe, it, expect } from "vitest";
import { startSession, type StartSessionDeps } from "./startSession.js";
import type { Card, FsrsCardState } from "~/domain/mastery/card.js";
import type { LexicalItem } from "~/domain/lexicalItem.js";
import type { ReviewLog } from "~/domain/review/review.js";
import type { Catalog } from "../ports/catalog.js";
import type { WordSource } from "../ports/wordSource.js";
import type { CardRepository } from "../ports/cardRepository.js";
import type { Scheduler } from "../ports/scheduler.js";
import { FIRST_SESSION_SEED_WORDS } from "~/domain/constants.js";

const NOW = new Date("2026-07-02T00:00:00Z");

function fsrs(due: Date): FsrsCardState {
  return {
    due,
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0,
  };
}

function makeItem(senseId: string): LexicalItem {
  return {
    word: senseId,
    lemma: senseId,
    part_of_speech: "noun",
    sense_id: senseId,
    cefr: "B2",
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
    cued_valid_synonyms: null,
    fit_set_version: null,
    gen_model: "test",
    gen_spec_version: "test",
  };
}

const catalog: Catalog = { get: (id) => makeItem(id) };

/** Serves `pool` in order, honoring the exclude set + count. */
function makeWordSource(pool: string[]): WordSource {
  return {
    nextFrontierWords: async (_band, exclude, count) =>
      pool.filter((s) => !exclude.has(s)).slice(0, count),
  };
}

/** Fresh cards come due at `now` (a new card is due immediately). */
const scheduler: Scheduler = {
  newCard: (now) => fsrs(now),
  next: () => {
    throw new Error("not used in startSession");
  },
  getRetrievability: () => 1,
};

function makeRepo(initial: Card[] = []): CardRepository {
  const map = new Map<string, Card>(initial.map((c) => [`${c.userId}-${c.senseId}`, c]));
  const logs: ReviewLog[] = [];
  return {
    load: async (u, s) => map.get(`${u}-${s}`),
    save: async (c) => {
      map.set(`${c.userId}-${c.senseId}`, c);
    },
    appendReviewLog: async (l) => {
      logs.push(l);
    },
    logsForWord: async () => logs,
    listCards: async (u) => [...map.values()].filter((c) => c.userId === u),
    deleteCard: async (u, s) => {
      map.delete(`${u}-${s}`);
    },
  };
}

function reviewCard(senseId: string, due: Date): Card {
  return { userId: "u1", senseId, mastery: "Recognized", fsrs: { ...fsrs(due), reps: 3 } };
}

function makeDeps(pool: string[], initial: Card[] = []): StartSessionDeps {
  return { catalog, wordSource: makeWordSource(pool), cards: makeRepo(initial), scheduler };
}

describe("startSession", () => {
  it("SEED-1: a brand-new user's session seeds intros and returns them in `seeded`", async () => {
    const deps = makeDeps(["w1", "w2", "w3"]);
    const { seeded } = await startSession({ userId: "u1", frontierBand: "B2", now: NOW }, deps);
    expect(seeded).toHaveLength(FIRST_SESSION_SEED_WORDS);
  });

  it("LOOP-1: the seeded intros (due immediately) all appear in the queue", async () => {
    const deps = makeDeps(["w1", "w2", "w3"]);
    const { queue, seeded } = await startSession(
      { userId: "u1", frontierBand: "B2", now: NOW },
      deps,
    );
    const seededIds = seeded.map((c) => c.senseId).sort();
    expect([...queue].sort()).toEqual(seededIds);
  });

  it("LOOP-1: pre-existing due reviews surface most-overdue-first, seeded intros interleaved", async () => {
    // 3 due reviews (a backlog) → pacing caps intros to floor(0.4286*3)=1 (SEED-6, delegated).
    const existing = [
      reviewCard("r_mid", new Date("2026-06-15T00:00:00Z")),
      reviewCard("r_old", new Date("2026-06-01T00:00:00Z")),
      reviewCard("r_new", new Date("2026-07-01T00:00:00Z")),
    ];
    const deps = makeDeps(["x0", "x1", "x2"], existing);
    const { queue, seeded } = await startSession(
      { userId: "u1", frontierBand: "B2", now: NOW },
      deps,
    );

    expect(seeded).toHaveLength(1);
    const intro = seeded[0]!.senseId;
    // Reviews are surfaced in due-ascending order, keeping their relative order in the queue.
    expect(queue.filter((s) => s.startsWith("r_"))).toEqual(["r_old", "r_mid", "r_new"]);
    // The seeded intro is interleaved among the reviews (SEED-6) — neither first nor last.
    const xi = queue.indexOf(intro);
    expect(xi).toBeGreaterThan(0);
    expect(xi).toBeLessThan(queue.length - 1);
    expect(queue).toHaveLength(4);
  });

  it("LOOP-1: cards not yet due are excluded from the queue", async () => {
    // One existing card due in the future → not surfaced; it is still a backlog-free steady state.
    const future = new Date(NOW.getTime() + 86_400_000);
    const existing = [reviewCard("later", future)];
    const deps = makeDeps(["w1", "w2", "w3", "w4", "w5", "w6"], existing);
    const { queue } = await startSession({ userId: "u1", frontierBand: "B2", now: NOW }, deps);
    expect(queue).not.toContain("later");
  });
});
