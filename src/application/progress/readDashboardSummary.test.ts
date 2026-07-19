import { describe, it, expect } from "vitest";
import { readDashboardSummary, type ReadDashboardSummaryDeps } from "./readDashboardSummary.js";
import type { Card, FsrsCardState, MasteryState } from "~/domain/mastery/card.js";
import type { FsrsReviewLog, ReviewLog, ReviewTier } from "~/domain/review/review.js";
import type { Rating } from "~/domain/review/rating.js";
import type { CardRepository } from "../ports/cardRepository.js";
import type { SettingsStore } from "../ports/settings.js";
import type { WordSource } from "../ports/wordSource.js";
import type { SeedLedgerStore } from "../ports/seedLedger.js";
import { DEFAULT_USER_SETTINGS } from "~/domain/settings.js";
import {
  DAILY_GOAL_DEFAULT,
  FIRST_SESSION_SEED_WORDS,
  NEW_PER_DAY,
} from "~/domain/constants.js";

const NOW = new Date("2026-06-30T12:00:00Z");
const USER = "u1";
const BAND = "B2";

const FSRS_STUB: FsrsReviewLog = {
  rating: 3,
  state: 2,
  due: NOW,
  stability: 1,
  difficulty: 5,
  elapsed_days: 0,
  last_elapsed_days: 0,
  scheduled_days: 1,
  review: NOW,
};

function fsrs(due: Date): FsrsCardState {
  return {
    due,
    stability: 10,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 1,
    lapses: 0,
    state: 2,
  };
}

function card(senseId: string, mastery: MasteryState, due: Date): Card {
  return { userId: USER, senseId, mastery, fsrs: fsrs(due) };
}

function log(senseId: string, reviewedAt: string, tier: ReviewTier, rating: Rating): ReviewLog {
  return { userId: USER, senseId, tier, rating, reviewedAt: new Date(reviewedAt), fsrs: FSRS_STUB };
}

function settingsStub(dailyGoal = DAILY_GOAL_DEFAULT): SettingsStore {
  return {
    read: async () => ({ ...DEFAULT_USER_SETTINGS, dailyGoal }),
    write: async () => {},
  };
}

/** A frontier with `available` un-carded words; returns min(count, available), like a live band. */
function wordSourceStub(available = 50): WordSource {
  return {
    nextFrontierWords: async (_band, _exclude, count) =>
      Array.from({ length: Math.min(count, available) }, (_, i) => `new-${i}`),
  };
}

/** The seed ledger; `undefined` (default) is a first-ever seed → the rail grants the full cap. */
function seedLedgerStub(lastSeedAt?: Date, seededCount = 0): SeedLedgerStore {
  return {
    read: async () => (lastSeedAt ? { lastSeedAt, seededCount } : undefined),
    record: async () => {},
  };
}

function makeDeps(
  cards: Card[],
  logsBySense: Record<string, ReviewLog[]> = {},
  settings: SettingsStore = settingsStub(),
  wordSource: WordSource = wordSourceStub(),
  seedLedger: SeedLedgerStore = seedLedgerStub(),
): ReadDashboardSummaryDeps {
  const repo: CardRepository = {
    load: async () => undefined,
    save: async () => {},
    appendReviewLog: async () => {},
    logsForWord: async (_u, senseId) => logsBySense[senseId] ?? [],
    listCards: async () => cards,
    deleteCard: async () => {},
  };
  return { cards: repo, settings, wordSource, seedLedger };
}

const PAST = new Date("2026-06-29T00:00:00Z"); // due (<= now)
const FUTURE = new Date("2026-07-05T00:00:00Z"); // not due

describe("readDashboardSummary", () => {
  it("SM-1: tallies the mastery ladder across the user's cards", async () => {
    const deps = makeDeps([
      card("a", "Seen", FUTURE),
      card("b", "Recognized", FUTURE),
      card("c", "Productive", FUTURE),
      card("d", "Productive", FUTURE),
      card("e", "Fluent", FUTURE),
    ]);

    const res = await readDashboardSummary({ userId: USER, frontierBand: BAND, now: NOW }, deps);

    expect(res.ladder).toEqual([
      { state: "Seen", count: 1 },
      { state: "Recognized", count: 1 },
      { state: "Productive", count: 2 },
      { state: "Fluent", count: 1 },
    ]);
  });

  it("counts due reviews as cards whose fsrs.due <= now", async () => {
    const deps = makeDeps([
      card("a", "Productive", PAST),
      card("b", "Recognized", PAST),
      card("c", "Fluent", FUTURE),
    ]);

    const res = await readDashboardSummary({ userId: USER, frontierBand: BAND, now: NOW }, deps);

    expect(res.dueReviews).toBe(2);
  });

  it("SEED-1: an empty card set is the first session — seeds FIRST_SESSION_SEED_WORDS new", async () => {
    const res = await readDashboardSummary({ userId: USER, frontierBand: BAND, now: NOW }, makeDeps([]));

    expect(res.newIntroductions).toBe(FIRST_SESSION_SEED_WORDS);
    expect(res.dueReviews).toBe(0);
  });

  it("SEED-6: with no due backlog, the full daily pace of new introductions is allowed", async () => {
    // All existing cards scheduled in the future → no backlog → NEW_PER_DAY.
    const deps = makeDeps([card("a", "Fluent", FUTURE), card("b", "Fluent", FUTURE)]);

    const res = await readDashboardSummary({ userId: USER, frontierBand: BAND, now: NOW }, deps);

    expect(res.newIntroductions).toBe(NEW_PER_DAY);
  });

  it("SEED-5: new introductions are capped at the frontier's actual supply, not the pacing ceiling", async () => {
    // No backlog → the pace would allow NEW_PER_DAY, but only 2 un-carded frontier words remain.
    const deps = makeDeps(
      [card("a", "Fluent", FUTURE)],
      {},
      settingsStub(),
      wordSourceStub(2),
    );

    const res = await readDashboardSummary({ userId: USER, frontierBand: BAND, now: NOW }, deps);

    expect(res.newIntroductions).toBe(2);
  });

  it("SEED-5: an exhausted frontier band reports 0 new even when the pace allows some", async () => {
    const deps = makeDeps(
      [card("a", "Fluent", FUTURE)],
      {},
      settingsStub(),
      wordSourceStub(0),
    );

    const res = await readDashboardSummary({ userId: USER, frontierBand: BAND, now: NOW }, deps);

    expect(res.newIntroductions).toBe(0);
  });

  it("SEED-10: reports 0 new when today's cap is already spent (the reported 'up to 5 new' bug)", async () => {
    // Already introduced NEW_PER_DAY THIS learner-local day → the cap is spent → the next /review
    // introduces nothing, so the dashboard must not advertise the daily pace even with 0 due.
    const lastSeedAt = new Date("2026-06-30T08:00:00Z"); // same UTC day as NOW
    const deps = makeDeps(
      [card("a", "Fluent", FUTURE)],
      {},
      settingsStub(),
      wordSourceStub(50),
      seedLedgerStub(lastSeedAt, NEW_PER_DAY),
    );

    const res = await readDashboardSummary({ userId: USER, frontierBand: BAND, now: NOW }, deps);

    expect(res.dueReviews).toBe(0);
    expect(res.newIntroductions).toBe(0);
  });

  it("SEED-10: after a partial seed today, reports only the remaining daily cap", async () => {
    // Seeded 2 earlier today with 0 due backlog → the cap allows 3 more, and a same-day refill needs
    // no gap wait — so the dashboard advertises exactly the remaining 3, not the full pace.
    const lastSeedAt = new Date("2026-06-30T08:00:00Z"); // same UTC day as NOW
    const deps = makeDeps(
      [card("a", "Fluent", FUTURE)],
      {},
      settingsStub(),
      wordSourceStub(50),
      seedLedgerStub(lastSeedAt, 2),
    );

    const res = await readDashboardSummary({ userId: USER, frontierBand: BAND, now: NOW }, deps);

    expect(res.newIntroductions).toBe(NEW_PER_DAY - 2);
  });

  it("BAT-14: a new calendar day still within the min gap reports 0 new", async () => {
    const now = new Date("2026-07-01T00:30:00Z");
    const lastSeedAt = new Date("2026-06-30T23:45:00Z"); // new day, but < SEED_MIN_GAP_HOURS elapsed
    const deps = makeDeps(
      [card("a", "Fluent", FUTURE)],
      {},
      settingsStub(),
      wordSourceStub(50),
      seedLedgerStub(lastSeedAt),
    );

    const res = await readDashboardSummary({ userId: USER, frontierBand: BAND, now }, deps);

    expect(res.newIntroductions).toBe(0);
  });

  it("CNT-8: sentencesToday sums today's free judged passes (uses), across words", async () => {
    const deps = makeDeps(
      [card("a", "Productive", PAST), card("b", "Fluent", PAST)],
      {
        a: [
          log("a", "2026-06-30T09:00:00Z", "free", "Good"), // today, counts
          log("a", "2026-06-30T11:00:00Z", "free", "Good"), // today, counts (a second USE)
          log("a", "2026-06-29T09:00:00Z", "free", "Good"), // yesterday, ignored
        ],
        b: [
          log("b", "2026-06-30T10:00:00Z", "free", "Good"), // today, counts
          log("b", "2026-06-30T10:30:00Z", "cued", "Good"), // INV-4, ignored
          log("b", "2026-06-30T11:30:00Z", "free", "Again"), // fail, ignored
        ],
      },
    );

    const res = await readDashboardSummary({ userId: USER, frontierBand: BAND, now: NOW }, deps);

    expect(res.sentencesToday).toBe(3);
  });

  it("CNT-8: exposes the default daily goal when the learner has no persisted setting", async () => {
    const res = await readDashboardSummary({ userId: USER, frontierBand: BAND, now: NOW }, makeDeps([]));
    expect(res.dailyGoal).toBe(DAILY_GOAL_DEFAULT);
  });

  it("CNT-8: reflects the learner's persisted daily goal", async () => {
    const res = await readDashboardSummary(
      { userId: USER, frontierBand: BAND, now: NOW },
      makeDeps([], {}, settingsStub(12)),
    );
    expect(res.dailyGoal).toBe(12);
  });
});
