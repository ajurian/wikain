import { describe, it, expect } from "vitest";
import { composeSession, composeReviewPass, DEV_JUDGE_VERSIONS } from "./composition.js";
import { makeTestStores } from "./testStores.js";
import { FakeJudge } from "./fakeJudge.js";
import { startSession } from "../application/session/startSession.js";
import { runReviewPass, type RunReviewPassDeps } from "../application/review/runReviewPass.js";
import { FIRST_SESSION_SEED_WORDS } from "../domain/constants.js";
import { USER_A } from "./testIds.js";

/**
 * Smoke test of the session-start entry point (spec/11 LOOP-1 step 1) over the REAL catalog with REAL
 * ts-fsrs + pglite-backed Drizzle stores — no external services. It proves the loop no longer needs
 * `senseId` handed to it: `startSession` seeds a first session and hands back an ordered queue, and every
 * queued word is then reviewable end-to-end through the real `runReviewPass`. "B2" is the default
 * ~B2+NAWL frontier (SEED-5).
 */
describe("session start → queue → loop (smoke: real catalog + ts-fsrs)", () => {
  const BAND = "B2";
  const now = new Date("2026-07-02T00:00:00Z");

  it("SEED-1/LOOP-1: a first session seeds FIRST_SESSION_SEED_WORDS Seen cards and queues them all", async () => {
    const { cards, marks, catalog, wordSource } = await makeTestStores();
    const { queue, seeded } = await startSession(
      { userId: USER_A, frontierBand: BAND, now },
      composeSession(cards, marks, catalog, wordSource),
    );

    expect(seeded).toHaveLength(FIRST_SESSION_SEED_WORDS);
    expect(seeded.every((c) => c.mastery === "Seen")).toBe(true); // no marks → no skip (SEED-3)
    // Every freshly-seeded card is due immediately, so all appear in the queue (LOOP-1).
    expect([...queue].sort()).toEqual(seeded.map((c) => c.senseId).sort());
  });

  it("LOOP-1: every queued word is reviewable end-to-end via runReviewPass", async () => {
    const { cards, marks, memo, catalog, wordSource } = await makeTestStores();
    const sessionDeps = composeSession(cards, marks, catalog, wordSource);
    const { queue } = await startSession({ userId: USER_A, frontierBand: BAND, now }, sessionDeps);

    // Review pass shares the SAME repository the session seeded into.
    const judge = new FakeJudge();
    const reviewDeps: RunReviewPassDeps = composeReviewPass(judge, cards, memo, DEV_JUDGE_VERSIONS, catalog);

    for (const senseId of queue) {
      const word = sessionDeps.catalog.get(senseId)!.word;
      // A fresh Seen word surfaces the meaning→word MCQ first; picking the target word passes (TIER-2).
      const res = await runReviewPass({ userId: USER_A, senseId, response: word, now }, reviewDeps);
      expect(res.tier).toBe("recognition"); // LOOP-1 step 2: Seen → recognition on-ramp
      if (res.tier === "recognition") expect(res.outcome.passed).toBe(true);
    }

    // The whole session-start climb is deterministic — the judge is never reached (LOOP-2).
    expect(judge.calls).toHaveLength(0);
    // One ReviewLog per queued word was persisted (DM-6 / LOOP-5).
    let logCount = 0;
    for (const senseId of queue) logCount += (await cards.logsForWord(USER_A, senseId)).length;
    expect(logCount).toBe(queue.length);
  });

  it("composeSession wires a session without throwing", async () => {
    const { cards, marks, catalog, wordSource } = await makeTestStores();
    expect(() => composeSession(cards, marks, catalog, wordSource)).not.toThrow();
  });
});
