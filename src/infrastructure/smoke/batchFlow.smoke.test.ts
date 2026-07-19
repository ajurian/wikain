import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import {
  composeBatchProgress,
  composeReviewPass,
  composeSessionFlow,
  DEV_JUDGE_VERSIONS,
} from "../composition.js";
import { makeTestStores } from "../testStores.js";
import { FakeJudge } from "../judge/fakeJudge.js";
import { getOrResumeSession } from "~/application/session/getOrResumeSession.js";
import { advanceActiveBatch } from "~/application/session/advanceActiveBatch.js";
import { recordSeamChoice } from "~/application/session/recordSeamChoice.js";
import { reviewWasRated, runReviewPass } from "~/application/review/runReviewPass.js";
import { BATCH_ABSENCE_T_MINUTES, NEW_PER_DAY } from "~/domain/constants.js";
import { reviewBatches } from "../db/schema.js";
import { USER_A } from "../testIds.js";

/**
 * Smoke test of the whole mini-session flow (spec/14) over the REAL catalog + pglite Drizzle
 * stores, composed exactly as the server functions compose them: the two-branch entry point
 * (BAT-11/12/13), the day-guarded build (BAT-14), progress advancing only on logged ratings
 * (BAT-7) through the REAL `runReviewPass`, the completed/abandoned instrumentation rows (BAT-16),
 * and the seam choice (BAT-9).
 */
describe("mini-session batch flow (smoke: real catalog + pglite)", () => {
  const now = new Date("2026-07-17T10:00:00Z");
  const INPUT = { userId: USER_A, frontierBand: "B2", utcOffsetMinutes: 0 };

  it("BAT-7/9/14/15/16: fresh build → rate through the batch → completed row → seam Continue → exhausted", async () => {
    const s = await makeTestStores();
    const flowDeps = composeSessionFlow(
      s.cards, s.marks, s.catalog, s.wordSource, s.sessionState, s.seedLedger,
      s.seedInstrumentation, s.batches,
    );
    const progressDeps = composeBatchProgress(s.sessionState, s.batches);
    const judge = new FakeJudge();
    const reviewDeps = composeReviewPass(
      judge, s.cards, s.memo, DEV_JUDGE_VERSIONS, s.catalog, s.analyzer, s.healQueue,
    );

    // Fresh session: BAT-14 seeds (first build of the day) and a batch presents at 0/M.
    const first = await getOrResumeSession({ ...INPUT, now }, flowDeps);
    expect(first.kind).toBe("batch");
    if (first.kind !== "batch") return;
    expect(first.framing).toBe("fresh");
    const batch = first.state;
    expect(batch.entries.length).toBeGreaterThan(0);
    expect(batch.progressIndex).toBe(0);

    // Drive every card through the REAL loop as submitReviewFn does: pass → reviewWasRated →
    // advance. Seeded words surface the recognition MCQ; answering with the target word passes.
    let t = now.getTime();
    let seam = false;
    for (const [i, e] of batch.entries.entries()) {
      t += 30_000;
      const word = s.catalog.get(e.senseId)!.word;
      const res = await runReviewPass(
        { userId: USER_A, senseId: e.senseId, response: word, durationMs: 9_000, now: new Date(t) },
        reviewDeps,
      );
      const adv = await advanceActiveBatch(
        { userId: USER_A, senseId: e.senseId, ratingLogged: reviewWasRated(res), now: new Date(t) },
        progressDeps,
      );
      if (!adv.active) throw new Error("expected an active batch");
      expect(adv.progress.completed).toBe(i + 1); // BAT-7: one tick per logged rating
      seam = adv.progress.atSeam;
    }
    expect(seam).toBe(true);

    // BAT-16: the N/N tick finalized the row as completed; BAT-15: duration_ms rode each log.
    const [row] = await s.db
      .select()
      .from(reviewBatches)
      .where(eq(reviewBatches.batchId, batch.batchId));
    expect(row!.outcome).toBe("completed");
    expect(row!.completedCount).toBe(batch.entries.length);
    const logs = await s.cards.logsForWord(USER_A, batch.entries[0]!.senseId);
    expect(logs[0]!.durationMs).toBe(9_000);

    // BAT-9 + SEED-10: Continue at the seam. Every rated card was rescheduled into the future, but the
    // first build seeded only the fast-win batch (FIRST_SESSION_SEED_WORDS), so the day's NEW_PER_DAY
    // cap still has headroom — a same-day Continue seeds the remaining intros (the boundary-guard
    // refill), NOT nothing. Keep continuing + driving until the daily cap is spent, then it's exhausted.
    let seededTotal = batch.entries.length;
    let result = await recordSeamChoice(
      { ...INPUT, choice: "continue", now: new Date(t) },
      flowDeps,
    );
    const [chosen] = await s.db
      .select()
      .from(reviewBatches)
      .where(eq(reviewBatches.batchId, batch.batchId));
    expect(chosen!.continueChosen).toBe(true);

    while (result.kind === "batch") {
      for (const e of result.state.entries) {
        t += 30_000;
        const word = s.catalog.get(e.senseId)!.word;
        const res = await runReviewPass(
          { userId: USER_A, senseId: e.senseId, response: word, durationMs: 9_000, now: new Date(t) },
          reviewDeps,
        );
        const adv = await advanceActiveBatch(
          { userId: USER_A, senseId: e.senseId, ratingLogged: reviewWasRated(res), now: new Date(t) },
          progressDeps,
        );
        if (!adv.active) throw new Error("expected an active batch");
      }
      seededTotal += result.state.entries.length;
      result = await recordSeamChoice(
        { ...INPUT, choice: "continue", now: new Date(t) },
        flowDeps,
      );
    }

    expect(result.kind).toBe("empty"); // exhausted once the day's cap is spent
    expect(seededTotal).toBe(NEW_PER_DAY); // SEED-10: never more than the daily cap in one local day
  });

  it("BAT-12/13/14: within T resumes the same batch; past T finalizes abandoned + welcome-back, no re-seed", async () => {
    const s = await makeTestStores();
    const flowDeps = composeSessionFlow(
      s.cards, s.marks, s.catalog, s.wordSource, s.sessionState, s.seedLedger,
      s.seedInstrumentation, s.batches,
    );

    const first = await getOrResumeSession({ ...INPUT, now }, flowDeps);
    if (first.kind !== "batch") throw new Error("expected a batch");
    const cardCount = (await s.cards.listCards(USER_A)).length;

    // Within T: the SAME batch resumes at true progress (BAT-12).
    const soon = new Date(now.getTime() + 5 * 60_000);
    const resumed = await getOrResumeSession({ ...INPUT, now: soon }, flowDeps);
    expect(resumed.kind).toBe("batch");
    if (resumed.kind === "batch") {
      expect(resumed.framing).toBe("resumed");
      expect(resumed.state.batchId).toBe(first.state.batchId);
    }

    // Past T: the stale batch finalizes abandoned; a fresh 0/M presents; nothing re-seeds (BAT-13/14).
    const later = new Date(now.getTime() + (BATCH_ABSENCE_T_MINUTES + 1) * 60_000);
    const back = await getOrResumeSession({ ...INPUT, now: later }, flowDeps);
    expect(back.kind).toBe("batch");
    if (back.kind === "batch") {
      expect(back.framing).toBe("welcomeBack");
      expect(back.state.batchId).not.toBe(first.state.batchId);
      expect(back.state.progressIndex).toBe(0);
    }
    expect((await s.cards.listCards(USER_A)).length).toBe(cardCount);

    const [stale] = await s.db
      .select()
      .from(reviewBatches)
      .where(eq(reviewBatches.batchId, first.state.batchId));
    expect(stale!.outcome).toBe("abandoned");
    expect(stale!.abandonedAtPosition).toBe(0);
  });
});
