import { describe, it, expect } from "vitest";
import { composeSession, composeReviewPass } from "./composition.js";
import { InMemoryCardRepository } from "./inMemoryCardRepository.js";
import { FakeJudge } from "./fakeJudge.js";
import { startSession } from "../application/startSession.js";
import { runReviewPass, type RunReviewPassDeps } from "../application/runReviewPass.js";
import { FIRST_SESSION_SEED_WORDS } from "../domain/constants.js";

/**
 * Smoke test of the session-start entry point (spec/11 LOOP-1 step 1) over the REAL catalog with REAL
 * ts-fsrs + an in-memory repo — no external services. It proves the loop no longer needs `senseId`
 * handed to it: `startSession` seeds a first session and hands back an ordered queue, and every queued
 * word is then reviewable end-to-end through the real `runReviewPass`. "B2" is the default ~B2+NAWL
 * frontier (SEED-5).
 */
describe("session start → queue → loop (smoke: real catalog + ts-fsrs)", () => {
  const BAND = "B2";
  const now = new Date("2026-07-02T00:00:00Z");

  it("SEED-1/LOOP-1: a first session seeds FIRST_SESSION_SEED_WORDS Seen cards and queues them all", async () => {
    const cards = new InMemoryCardRepository();
    const { queue, seeded } = await startSession(
      { userId: "u1", frontierBand: BAND, now },
      composeSession(cards),
    );

    expect(seeded).toHaveLength(FIRST_SESSION_SEED_WORDS);
    expect(seeded.every((c) => c.mastery === "Seen")).toBe(true); // no marks → no skip (SEED-3)
    // Every freshly-seeded card is due immediately, so all appear in the queue (LOOP-1).
    expect([...queue].sort()).toEqual(seeded.map((c) => c.senseId).sort());
  });

  it("LOOP-1: every queued word is reviewable end-to-end via runReviewPass", async () => {
    const cards = new InMemoryCardRepository();
    const sessionDeps = composeSession(cards);
    const { queue } = await startSession({ userId: "u2", frontierBand: BAND, now }, sessionDeps);

    // Review pass shares the SAME repository the session seeded into.
    const judge = new FakeJudge();
    const reviewDeps: RunReviewPassDeps = { ...composeReviewPass(judge), cards };

    for (const senseId of queue) {
      const word = sessionDeps.catalog.get(senseId)!.word;
      // A fresh Seen word surfaces the meaning→word MCQ first; picking the target word passes (TIER-2).
      const res = await runReviewPass({ userId: "u2", senseId, response: word, now }, reviewDeps);
      expect(res.tier).toBe("recognition"); // LOOP-1 step 2: Seen → recognition on-ramp
      if (res.tier === "recognition") expect(res.outcome.passed).toBe(true);
    }

    // The whole session-start climb is deterministic — the judge is never reached (LOOP-2).
    expect(judge.calls).toHaveLength(0);
    // One ReviewLog per queued word was persisted (DM-6 / LOOP-5).
    expect(cards.reviewLogs).toHaveLength(queue.length);
  });

  it("composeSession wires a session without throwing", () => {
    expect(() => composeSession()).not.toThrow();
  });
});
