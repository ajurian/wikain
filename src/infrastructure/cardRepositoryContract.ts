/**
 * Shared CardRepository conformance suite (spec/12-data-model.md DM-5..DM-7). Every implementation of
 * the port MUST pass identically — this is the executable statement of Liskov substitutability
 * (SOLID-3): the in-memory and Drizzle adapters are run through the SAME assertions, so a divergence
 * fails the build. Not a `*.test.ts` itself; imported by each adapter's test file.
 */
import { describe, expect, it } from "vitest";
import type { CardRepository } from "../application/ports/cardRepository.js";
import type { Card, FsrsCardState } from "../domain/card.js";
import type { ReviewLog, FsrsReviewLog } from "../domain/review.js";

function fsrsCardState(overrides: Partial<FsrsCardState> = {}): FsrsCardState {
  return {
    due: new Date("2026-07-01T12:00:00.000Z"),
    stability: 3.14,
    difficulty: 5.5,
    elapsed_days: 0,
    scheduled_days: 1,
    reps: 2,
    lapses: 1,
    state: 2,
    last_review: new Date("2026-06-30T09:30:00.000Z"),
    ...overrides,
  };
}

function card(overrides: Partial<Card> = {}): Card {
  return {
    userId: "user-a",
    senseId: "abandon_verb_01",
    mastery: "Recognized",
    fsrs: fsrsCardState(),
    ...overrides,
  };
}

function fsrsReviewLog(overrides: Partial<FsrsReviewLog> = {}): FsrsReviewLog {
  return {
    rating: 3,
    state: 2,
    due: new Date("2026-07-05T12:00:00.000Z"),
    stability: 4.2,
    difficulty: 5.5,
    elapsed_days: 1,
    last_elapsed_days: 0,
    scheduled_days: 4,
    review: new Date("2026-07-01T12:00:00.000Z"),
    ...overrides,
  };
}

function reviewLog(overrides: Partial<ReviewLog> = {}): ReviewLog {
  return {
    userId: "user-a",
    senseId: "abandon_verb_01",
    tier: "free",
    rating: "Good",
    reviewedAt: new Date("2026-07-01T12:00:00.000Z"),
    scaffolded: false,
    fsrs: fsrsReviewLog(),
    ...overrides,
  };
}

/**
 * Runs the full port contract against a freshly-isolated repository produced by `makeRepo` (a new,
 * empty store per call so tests never share state).
 */
export function describeCardRepositoryContract(
  label: string,
  makeRepo: () => Promise<CardRepository>,
): void {
  describe(`CardRepository contract — ${label}`, () => {
    it("DM-5: round-trips a saved card (dates + mastery preserved)", async () => {
      const repo = await makeRepo();
      const c = card();
      await repo.save(c);

      const loaded = await repo.load(c.userId, c.senseId);
      expect(loaded).toBeDefined();
      expect(loaded!.mastery).toBe("Recognized");
      expect(loaded!.fsrs.due.getTime()).toBe(c.fsrs.due.getTime());
      expect(loaded!.fsrs.last_review?.getTime()).toBe(c.fsrs.last_review?.getTime());
      expect(loaded!.fsrs.stability).toBe(c.fsrs.stability);
      expect(loaded!.fsrs.reps).toBe(c.fsrs.reps);
      expect(loaded!.fsrs.state).toBe(c.fsrs.state);
    });

    it("DM-7: persists mastery independently of the FSRS state", async () => {
      const repo = await makeRepo();
      // Same FSRS internal state, different mastery — the two must not be conflated (INV-3).
      await repo.save(card({ mastery: "Fluent" }));
      const loaded = await repo.load("user-a", "abandon_verb_01");
      expect(loaded!.mastery).toBe("Fluent");
    });

    it("tolerates a card with no last_review (undefined round-trips as undefined)", async () => {
      const repo = await makeRepo();
      await repo.save(card({ fsrs: fsrsCardState({ last_review: undefined }) }));
      const loaded = await repo.load("user-a", "abandon_verb_01");
      expect(loaded!.fsrs.last_review).toBeUndefined();
    });

    it("returns undefined for an absent card", async () => {
      const repo = await makeRepo();
      expect(await repo.load("nobody", "nothing_noun_01")).toBeUndefined();
    });

    it("SM-2: save upserts on (userId, senseId) — one card per word, no duplicate", async () => {
      const repo = await makeRepo();
      await repo.save(card({ mastery: "Recognized" }));
      await repo.save(card({ mastery: "Productive" }));

      const loaded = await repo.load("user-a", "abandon_verb_01");
      expect(loaded!.mastery).toBe("Productive");
      expect(await repo.listCards("user-a")).toHaveLength(1);
    });

    it("DM-6: appendReviewLog + logsForWord returns logs in append order", async () => {
      const repo = await makeRepo();
      await repo.appendReviewLog(
        reviewLog({ reviewedAt: new Date("2026-07-01T00:00:00.000Z"), rating: "Good" }),
      );
      await repo.appendReviewLog(
        reviewLog({ reviewedAt: new Date("2026-07-02T00:00:00.000Z"), rating: "Again" }),
      );

      const logs = await repo.logsForWord("user-a", "abandon_verb_01");
      expect(logs.map((l) => l.rating)).toEqual(["Good", "Again"]);
      expect(logs[0]!.fsrs.due.getTime()).toBe(fsrsReviewLog().due.getTime());
      expect(logs[0]!.scaffolded).toBe(false);
    });

    it("INV-4: logsForWord filters by user and word", async () => {
      const repo = await makeRepo();
      await repo.appendReviewLog(reviewLog({ userId: "user-a", senseId: "abandon_verb_01" }));
      await repo.appendReviewLog(reviewLog({ userId: "user-a", senseId: "afford_verb_01" }));
      await repo.appendReviewLog(reviewLog({ userId: "user-b", senseId: "abandon_verb_01" }));

      const logs = await repo.logsForWord("user-a", "abandon_verb_01");
      expect(logs).toHaveLength(1);
    });

    it("multi-tenant: listCards scopes to one user", async () => {
      const repo = await makeRepo();
      await repo.save(card({ userId: "user-a", senseId: "abandon_verb_01" }));
      await repo.save(card({ userId: "user-a", senseId: "afford_verb_01" }));
      await repo.save(card({ userId: "user-b", senseId: "abandon_verb_01" }));

      expect(await repo.listCards("user-a")).toHaveLength(2);
      expect(await repo.listCards("user-b")).toHaveLength(1);
    });

    it("tolerates a review log with no scaffolded flag (cued tier)", async () => {
      const repo = await makeRepo();
      await repo.appendReviewLog(reviewLog({ tier: "cued", scaffolded: undefined }));
      const logs = await repo.logsForWord("user-a", "abandon_verb_01");
      expect(logs[0]!.scaffolded).toBeUndefined();
    });
  });
}
