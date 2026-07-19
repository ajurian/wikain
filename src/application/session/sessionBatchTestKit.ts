/**
 * Shared in-memory fakes for the mini-session use-case tests (spec/14 BAT-*). Not a `*.test.ts`
 * itself — a test kit beside the use-cases it serves (DIR-4), mirroring the fixture style of
 * `startSession.test.ts`. The fakes record every write so tests assert side-effects directly.
 */
import type { Card, FsrsCardState, MasteryState } from "~/domain/mastery/card.js";
import type { LexicalItem } from "~/domain/lexicalItem.js";
import type { ReviewLog } from "~/domain/review/review.js";
import type { Catalog } from "../ports/catalog.js";
import type { WordSource } from "../ports/wordSource.js";
import type { CardRepository } from "../ports/cardRepository.js";
import type { Scheduler } from "../ports/scheduler.js";
import type { ActiveSessionState, SessionStateStore } from "../ports/sessionState.js";
import type { SeedLedgerStore } from "../ports/seedLedger.js";
import type {
  DeniedSeedEvent,
  GrantedSeedEvent,
  SeedInstrumentationStore,
} from "../ports/seedInstrumentation.js";
import type {
  BatchFinalization,
  BatchInstrumentationStore,
  PlannedBatchRow,
} from "../ports/batchInstrumentation.js";
import type { BuildSessionBatchDeps } from "./buildSessionBatch.js";

export const KIT_NOW = new Date("2026-07-17T10:00:00Z");

export function fsrs(due: Date): FsrsCardState {
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

export function card(senseId: string, mastery: MasteryState, due: Date = KIT_NOW): Card {
  return { userId: "u1", senseId, mastery, fsrs: fsrs(due) };
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
    fit_set_version: null,
    gen_model: "test",
    gen_spec_version: "test",
  };
}

export const kitCatalog: Catalog = { get: (id) => makeItem(id) };

export function makeWordSource(pool: string[]): WordSource {
  return {
    nextFrontierWords: async (_band, exclude, count) =>
      pool.filter((s) => !exclude.has(s)).slice(0, count),
  };
}

export const kitScheduler: Scheduler = {
  newCard: (now) => fsrs(now),
  next: () => {
    throw new Error("not used by batch construction");
  },
  getRetrievability: () => 1,
};

export function makeCardRepo(initial: Card[] = []): CardRepository {
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
    logsForWord: async (u, s) => logs.filter((l) => l.userId === u && l.senseId === s),
    listCards: async (u) => [...map.values()].filter((c) => c.userId === u),
    deleteCard: async (u, s) => {
      map.delete(`${u}-${s}`);
    },
  };
}

export function makeSessionStateStore(): SessionStateStore & {
  peek: (userId: string) => ActiveSessionState | undefined;
} {
  const map = new Map<string, ActiveSessionState>();
  return {
    load: async (u) => map.get(u),
    save: async (s) => {
      map.set(s.userId, s);
    },
    clear: async (u) => {
      map.delete(u);
    },
    peek: (u) => map.get(u),
  };
}

export function makeSeedLedger(): SeedLedgerStore {
  const map = new Map<string, { lastSeedAt: Date; seededCount: number }>();
  return {
    read: async (u) => map.get(u),
    record: async (u, at, seededCount) => {
      map.set(u, { lastSeedAt: at, seededCount });
    },
  };
}

export function makeSeedInstrumentation(): SeedInstrumentationStore & {
  granted: GrantedSeedEvent[];
  denied: DeniedSeedEvent[];
} {
  const granted: GrantedSeedEvent[] = [];
  const denied: DeniedSeedEvent[] = [];
  return {
    granted,
    denied,
    recordGrant: async (e) => {
      granted.push(e);
    },
    recordDenial: async (e) => {
      denied.push(e);
    },
  };
}

export function makeBatchStore(): BatchInstrumentationStore & {
  created: PlannedBatchRow[];
  finalized: { batchId: string; f: BatchFinalization }[];
  seamChoices: { batchId: string; continueChosen: boolean }[];
} {
  const created: PlannedBatchRow[] = [];
  const finalized: { batchId: string; f: BatchFinalization }[] = [];
  const seamChoices: { batchId: string; continueChosen: boolean }[] = [];
  return {
    created,
    finalized,
    seamChoices,
    create: async (row) => {
      created.push(row);
    },
    finalize: async (batchId, f) => {
      // The SQL guard's semantics (outcome IS NULL): the first finalization stands.
      if (!finalized.some((x) => x.batchId === batchId)) finalized.push({ batchId, f });
    },
    recordSeamChoice: async (batchId, continueChosen) => {
      seamChoices.push({ batchId, continueChosen });
    },
  };
}

let nextId = 0;
export function makeBuildDeps(
  cards: Card[] = [],
  pool: string[] = [],
): BuildSessionBatchDeps & {
  sessionStatePeek: (userId: string) => ActiveSessionState | undefined;
  batchStore: ReturnType<typeof makeBatchStore>;
  seedInstrumentation: ReturnType<typeof makeSeedInstrumentation>;
} {
  const sessionState = makeSessionStateStore();
  const batches = makeBatchStore();
  const seedInstrumentation = makeSeedInstrumentation();
  return {
    catalog: kitCatalog,
    wordSource: makeWordSource(pool),
    cards: makeCardRepo(cards),
    scheduler: kitScheduler,
    sessionState,
    seedLedger: makeSeedLedger(),
    seedInstrumentation,
    batches,
    idFactory: () => `batch-${++nextId}`,
    sessionStatePeek: sessionState.peek,
    batchStore: batches,
  };
}
