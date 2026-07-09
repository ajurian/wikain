import { describe, it, expect } from "vitest";
import { composeReviewPass, DEV_JUDGE_VERSIONS } from "./composition.js";
import { TsFsrsScheduler } from "./tsFsrsScheduler.js";
import { FakeJudge, passingVerdict } from "./fakeJudge.js";
import { makeTestStores, smokeFixtureItem } from "./testStores.js";
import { runReviewPass, type RunReviewPassDeps } from "../application/review/runReviewPass.js";
import type { DrizzleCardRepository } from "./drizzleCardRepository.js";
import type { MasteryState } from "../domain/mastery/card.js";
import { USER_A } from "./testIds.js";

/**
 * End-to-end smoke test of the loop orchestrator (spec/11) over the REAL catalog with REAL wink +
 * ts-fsrs and a FAKE judge — proving tier routing (LOOP-1/SM-1): a Recognized card takes the
 * deterministic cued branch with NO judge call (LOOP-2), a Productive card takes the judged branch
 * (LOOP-3/LOOP-4). Persistence is pglite-backed Drizzle; no network/auth/DeepSeek needed.
 */
describe("end-to-end loop (smoke: real catalog + wink + ts-fsrs, fake judge)", () => {
  const fx = smokeFixtureItem();
  const item = fx.item;
  const now = new Date("2026-06-30T00:00:00Z");

  async function wire(
    judge: FakeJudge,
    mastery: MasteryState,
  ): Promise<{ deps: RunReviewPassDeps; cards: DrizzleCardRepository }> {
    const { cards, memo, catalog } = await makeTestStores();
    const deps = composeReviewPass(judge, cards, memo, DEV_JUDGE_VERSIONS, catalog);
    await cards.save({ userId: USER_A, senseId: item.sense_id, mastery, fsrs: new TsFsrsScheduler().newCard(now) });
    return { deps, cards };
  }

  it("LOOP-1/LOOP-2: a Recognized card routes to the cued branch and makes no judge call", async () => {
    const judge = new FakeJudge(passingVerdict());
    const { deps, cards } = await wire(judge, "Recognized");

    const res = await runReviewPass(
      { userId: USER_A, senseId: item.sense_id, response: item.word, now },
      deps,
    );

    expect(res.tier).toBe("cued");
    if (res.tier === "cued") {
      expect(res.outcome.passed).toBe(true);
      expect(res.outcome.mastery).toBe("Productive"); // SM-4
    }
    expect(judge.calls).toHaveLength(0); // LOOP-2: deterministic, no LLM
    const logs = await cards.logsForWord(USER_A, item.sense_id);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.tier).toBe("cued");
  });

  it("LOOP-1/LOOP-4: a Productive card routes to the judged branch and rates on a real gate-passing sentence", async () => {
    const judge = new FakeJudge(passingVerdict());
    const { deps, cards } = await wire(judge, "Productive");

    const res = await runReviewPass(
      {
        userId: USER_A,
        senseId: item.sense_id,
        response: fx.passSentence,
        now,
      },
      deps,
    );

    expect(res.tier).toBe("free");
    if (res.tier === "free" && res.outcome.kind === "judged") {
      expect(res.outcome.passed).toBe(true);
      expect(res.outcome.rating).toBe("Good");
    }
    expect(judge.calls).toHaveLength(1);
    const logs = await cards.logsForWord(USER_A, item.sense_id);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.tier).toBe("free");
  });

  it("composeReviewPass wires the loop without throwing", async () => {
    const { cards, memo, catalog } = await makeTestStores();
    expect(() =>
      composeReviewPass(new FakeJudge(), cards, memo, DEV_JUDGE_VERSIONS, catalog),
    ).not.toThrow();
  });
});
