import { describe, it, expect } from "vitest";
import { readDashboardSummary, type ReadDashboardSummaryDeps } from "./readDashboardSummary.js";
import type { Card, FsrsCardState, MasteryState } from "../../domain/mastery/card.js";
import type { FsrsReviewLog, ReviewLog, ReviewTier } from "../../domain/review/review.js";
import type { Rating } from "../../domain/review/rating.js";
import type { CardRepository } from "../ports/cardRepository.js";
import type { SettingsStore } from "../ports/settings.js";
import { DEFAULT_USER_SETTINGS } from "../../domain/settings.js";
import {
  DAILY_GOAL_DEFAULT,
  FIRST_SESSION_SEED_WORDS,
  NEW_PER_DAY,
} from "../../domain/constants.js";

const NOW = new Date("2026-06-30T12:00:00Z");
const USER = "u1";

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

function makeDeps(
  cards: Card[],
  logsBySense: Record<string, ReviewLog[]> = {},
  settings: SettingsStore = settingsStub(),
): ReadDashboardSummaryDeps {
  const repo: CardRepository = {
    load: async () => undefined,
    save: async () => {},
    appendReviewLog: async () => {},
    logsForWord: async (_u, senseId) => logsBySense[senseId] ?? [],
    listCards: async () => cards,
  };
  return { cards: repo, settings };
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

    const res = await readDashboardSummary({ userId: USER, now: NOW }, deps);

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

    const res = await readDashboardSummary({ userId: USER, now: NOW }, deps);

    expect(res.dueReviews).toBe(2);
  });

  it("SEED-1: an empty card set is the first session — seeds FIRST_SESSION_SEED_WORDS new", async () => {
    const res = await readDashboardSummary({ userId: USER, now: NOW }, makeDeps([]));

    expect(res.newIntroductions).toBe(FIRST_SESSION_SEED_WORDS);
    expect(res.dueReviews).toBe(0);
  });

  it("SEED-6: with no due backlog, the full daily pace of new introductions is allowed", async () => {
    // All existing cards scheduled in the future → no backlog → NEW_PER_DAY.
    const deps = makeDeps([card("a", "Fluent", FUTURE), card("b", "Fluent", FUTURE)]);

    const res = await readDashboardSummary({ userId: USER, now: NOW }, deps);

    expect(res.newIntroductions).toBe(NEW_PER_DAY);
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

    const res = await readDashboardSummary({ userId: USER, now: NOW }, deps);

    expect(res.sentencesToday).toBe(3);
  });

  it("CNT-8: exposes the default daily goal when the learner has no persisted setting", async () => {
    const res = await readDashboardSummary({ userId: USER, now: NOW }, makeDeps([]));
    expect(res.dailyGoal).toBe(DAILY_GOAL_DEFAULT);
  });

  it("CNT-8: reflects the learner's persisted daily goal", async () => {
    const res = await readDashboardSummary(
      { userId: USER, now: NOW },
      makeDeps([], {}, settingsStub(12)),
    );
    expect(res.dailyGoal).toBe(12);
  });
});
