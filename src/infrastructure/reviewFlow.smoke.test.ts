import { describe, it, expect } from "vitest";
import {
  composeReviewPass,
  composeResolvePrompt,
  composeSession,
  DEV_JUDGE_VERSIONS,
} from "./composition.js";
import { makeTestStores } from "./testStores.js";
import { FakeJudge } from "./fakeJudge.js";
import { startSession } from "../application/session/startSession.js";
import { resolveReviewPrompt } from "../application/review/resolveReviewPrompt.js";
import { runReviewPass, type RunReviewPassDeps } from "../application/review/runReviewPass.js";
import type { ResolveReviewPromptDeps } from "../application/review/resolveReviewPrompt.js";
import { USER_A } from "./testIds.js";

/**
 * Smoke test of the exact data flow the presentation drives over a SHARED repo: start a session, then
 * for each queued word resolve the render-time prompt and submit the correct response. It proves the
 * property the UI depends on — the tier `resolveReviewPrompt` shows is always the tier `runReviewPass`
 * grades (they share `resolveReviewTier`), so the learner never sees a prompt for a different tier than
 * the one scored. Real catalog + ts-fsrs; FakeJudge records zero calls (deterministic tiers only).
 */
describe("review flow (smoke: prompt tier always matches graded tier)", () => {
  const now = new Date("2026-07-02T00:00:00Z");

  it("LOOP-1/TIER-2: each queued word resolves a prompt and passes at the SAME tier it is graded", async () => {
    const { cards, marks, memo, catalog, wordSource } = await makeTestStores();
    const sessionDeps = composeSession(cards, marks, catalog, wordSource);
    const promptDeps: ResolveReviewPromptDeps = composeResolvePrompt(cards, catalog);
    const judge = new FakeJudge();
    const reviewDeps: RunReviewPassDeps = composeReviewPass(judge, cards, memo, DEV_JUDGE_VERSIONS, catalog);

    const { queue } = await startSession({ userId: USER_A, frontierBand: "B2", now }, sessionDeps);
    expect(queue.length).toBeGreaterThan(0);

    for (const senseId of queue) {
      const prompt = await resolveReviewPrompt({ userId: USER_A, senseId }, promptDeps);
      // The correct answer for every deterministic tier is the target word.
      const correct = promptDeps.catalog.get(senseId)!.word;
      const res = await runReviewPass({ userId: USER_A, senseId, response: correct, now }, reviewDeps);

      // The core wiring invariant: shown tier === graded tier.
      expect(res.tier).toBe(prompt.tier);
      // A fresh Seen word is graded at recognition and the correct pick passes.
      expect(res.tier).toBe("recognition");
      if (res.tier === "recognition") expect(res.outcome.passed).toBe(true);
    }

    // Deterministic path only — the judge was never reached (LOOP-2).
    expect(judge.calls).toHaveLength(0);
  });
});
