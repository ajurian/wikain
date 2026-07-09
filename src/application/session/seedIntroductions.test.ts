import { describe, it, expect } from "vitest";
import { seedIntroductions, type SeedIntroductionsDeps } from "./seedIntroductions.js";
import type { Card, FsrsCardState } from "../../domain/mastery/card.js";
import type { Cefr, LexicalItem } from "../../domain/lexicalItem.js";
import type { ReviewLog } from "../../domain/review/review.js";
import type { Catalog } from "../ports/catalog.js";
import type { WordSource } from "../ports/wordSource.js";
import type { CardRepository } from "../ports/cardRepository.js";
import type { ColdStart, Scheduler } from "../ports/scheduler.js";
import {
  FIRST_SESSION_SEED_WORDS,
  NEW_PER_DAY,
} from "../../domain/constants.js";

const NOW = new Date("2026-07-02T00:00:00Z");

function makeItem(senseId: string, cefr: Cefr = "B2"): LexicalItem {
  return {
    word: senseId,
    lemma: senseId,
    part_of_speech: "noun",
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
    gen_model: "test",
    gen_spec_version: "test",
  };
}

/** Every requested senseId resolves to a B2 item unless overridden via `cefrs`. */
function makeCatalog(cefrs: Record<string, Cefr> = {}): Catalog {
  return {
    get: (id) => makeItem(id, cefrs[id] ?? "B2"),
  };
}

/** Serves `pool` in order, honoring the exclude set and count; records its calls. */
function makeWordSource(pool: string[]): {
  wordSource: WordSource;
  calls: { band: string; exclude: ReadonlySet<string>; count: number }[];
} {
  const calls: { band: string; exclude: ReadonlySet<string>; count: number }[] = [];
  const wordSource: WordSource = {
    nextFrontierWords: async (band, exclude, count) => {
      calls.push({ band, exclude, count });
      return pool.filter((s) => !exclude.has(s)).slice(0, count);
    },
  };
  return { wordSource, calls };
}

function makeFsrs(due: Date): FsrsCardState {
  return {
    due,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0,
  };
}

/** Records the cold-start seed passed to `newCard`; returns a card due at `now`. */
function makeScheduler(): { scheduler: Scheduler; coldStarts: (ColdStart | undefined)[] } {
  const coldStarts: (ColdStart | undefined)[] = [];
  const scheduler: Scheduler = {
    newCard: (now, coldStart) => {
      coldStarts.push(coldStart);
      return makeFsrs(now);
    },
    next: () => {
      throw new Error("not used in seeding");
    },
    getRetrievability: () => 1,
  };
  return { scheduler, coldStarts };
}

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
  };
}

function makeDeps(
  pool: string[],
  initial: Card[] = [],
  cefrs: Record<string, Cefr> = {},
): {
  deps: SeedIntroductionsDeps;
  calls: { band: string; exclude: ReadonlySet<string>; count: number }[];
  coldStarts: (ColdStart | undefined)[];
} {
  const { wordSource, calls } = makeWordSource(pool);
  const { scheduler, coldStarts } = makeScheduler();
  return {
    deps: { catalog: makeCatalog(cefrs), wordSource, cards: makeRepo(initial), scheduler },
    calls,
    coldStarts,
  };
}

function seededCard(senseId: string, due: Date): Card {
  return { userId: "u1", senseId, mastery: "Seen", fsrs: makeFsrs(due) };
}

describe("seedIntroductions", () => {
  it("SEED-1/6: a brand-new user's first session seeds FIRST_SESSION_SEED_WORDS words", async () => {
    const pool = ["w1", "w2", "w3", "w4", "w5"];
    const { deps, calls } = makeDeps(pool);
    const created = await seedIntroductions(
      { userId: "u1", frontierBand: "B2", now: NOW },
      deps,
    );
    expect(created).toHaveLength(FIRST_SESSION_SEED_WORDS);
    expect(calls[0]?.count).toBe(FIRST_SESSION_SEED_WORDS);
  });

  it("SEED-2/SM-11: an unmarked word enters Seen; a placement-known word enters Recognized", async () => {
    const { deps } = makeDeps(["w1", "w2"]);
    const created = await seedIntroductions(
      { userId: "u1", frontierBand: "B2", placementKnown: new Set(["w2"]), now: NOW },
      deps,
    );
    const byId = Object.fromEntries(created.map((c) => [c.senseId, c.mastery]));
    expect(byId["w1"]).toBe("Seen");
    expect(byId["w2"]).toBe("Recognized");
  });

  it("SEED-3: with no per-word marks, no word skips Seen regardless of frontier band", async () => {
    const { deps } = makeDeps(["w1", "w2"]);
    const created = await seedIntroductions(
      { userId: "u1", frontierBand: "C1", now: NOW }, // a high frontier band, but no marks
      deps,
    );
    expect(created.every((c) => c.mastery === "Seen")).toBe(true);
  });

  it("SEED-7: already-carded words are excluded and never re-created", async () => {
    // w1 already has a card, not yet due (so pacing permits introductions — isolates exclusion).
    const notDue = new Date(NOW.getTime() + 86_400_000);
    const existing = [seededCard("w1", notDue)];
    const { deps, calls } = makeDeps(["w1", "w2", "w3"], existing);
    const created = await seedIntroductions(
      { userId: "u1", frontierBand: "B2", now: NOW },
      deps,
    );
    expect(calls[0]?.exclude.has("w1")).toBe(true);
    expect(created.some((c) => c.senseId === "w1")).toBe(false);
  });

  it("SEED-8: each new card is created with a cold-start difficulty seed (>0)", async () => {
    const { deps, coldStarts } = makeDeps(["w1", "w2"]);
    await seedIntroductions({ userId: "u1", frontierBand: "B2", now: NOW }, deps);
    expect(coldStarts.every((c) => (c?.difficulty ?? 0) > 0)).toBe(true);
  });

  it("SEED-7: with no explicit placementKnown, a persisted mark makes that word enter Recognized", async () => {
    const { deps } = makeDeps(["w1", "w2"]);
    // The store, not the input, carries the mark — the real wiring path (onboarding recorded it).
    deps.marks = {
      record: async () => {},
      list: async () => ["w2"],
    };
    const created = await seedIntroductions({ userId: "u1", frontierBand: "B2", now: NOW }, deps);
    const byId = Object.fromEntries(created.map((c) => [c.senseId, c.mastery]));
    expect(byId["w1"]).toBe("Seen");
    expect(byId["w2"]).toBe("Recognized");
  });

  it("SEED-7: an explicit placementKnown overrides the marks store (store not consulted)", async () => {
    const { deps } = makeDeps(["w1", "w2"]);
    let listed = false;
    deps.marks = {
      record: async () => {},
      list: async () => {
        listed = true;
        return ["w1"];
      },
    };
    const created = await seedIntroductions(
      { userId: "u1", frontierBand: "B2", placementKnown: new Set(["w2"]), now: NOW },
      deps,
    );
    const byId = Object.fromEntries(created.map((c) => [c.senseId, c.mastery]));
    expect(byId["w2"]).toBe("Recognized"); // from the explicit set
    expect(byId["w1"]).toBe("Seen"); // the store's "w1" was ignored
    expect(listed).toBe(false);
  });

  it("SEED-6: not first session with a due backlog caps new introductions below NEW_PER_DAY", async () => {
    // 10 due cards (not first session) → pacing cap = floor(0.4286*10)=4 < NEW_PER_DAY(5).
    const existing = Array.from({ length: 10 }, (_, i) => seededCard(`old${i}`, NOW));
    const pool = Array.from({ length: 20 }, (_, i) => `new${i}`);
    const { deps, calls } = makeDeps(pool, existing);
    const created = await seedIntroductions(
      { userId: "u1", frontierBand: "B2", now: NOW },
      deps,
    );
    expect(created).toHaveLength(4);
    expect(created.length).toBeLessThan(NEW_PER_DAY);
    expect(calls[0]?.count).toBe(4);
  });
});
