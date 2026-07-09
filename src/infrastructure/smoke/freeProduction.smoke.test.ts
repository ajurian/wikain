import { describe, it, expect } from "vitest";
import { composeFreeProduction, DEV_JUDGE_VERSIONS } from "../composition.js";
import { TsFsrsScheduler } from "../tsFsrsScheduler.js";
import { FakeJudge, passingVerdict } from "../judge/fakeJudge.js";
import { makeTestStores, smokeFixtureItem } from "../testStores.js";
import { submitFreeProduction, type SubmitFreeProductionDeps } from "~/application/review/submitFreeProduction.js";
import type { DrizzleCardRepository } from "../persistence/drizzleCardRepository.js";
import { USER_A } from "../testIds.js";

/**
 * End-to-end smoke test of the judged free-production slice over the REAL catalog with REAL wink +
 * ts-fsrs and a FAKE judge — the architecture-proving path (RL-1..RL-4, JDG-2, INV-1, INV-2, SM-6).
 * Persistence is pglite-backed Drizzle; no network/auth/DeepSeek needed.
 */
describe("free-production slice (smoke: real catalog + wink + ts-fsrs, fake judge)", () => {
  const fx = smokeFixtureItem();
  const item = fx.item;
  const now = new Date("2026-06-30T00:00:00Z");

  async function wire(
    judge: FakeJudge,
  ): Promise<{ deps: SubmitFreeProductionDeps; cards: DrizzleCardRepository }> {
    const { cards, memo, catalog } = await makeTestStores();
    const deps = composeFreeProduction(judge, cards, memo, DEV_JUDGE_VERSIONS, catalog);
    return { deps, cards };
  }

  it("JDG-2/INV-1: a real gate-passing sentence yields exactly one Good rating + one ReviewLog", async () => {
    const judge = new FakeJudge(passingVerdict());
    const { deps, cards } = await wire(judge);
    await cards.save({
      userId: USER_A,
      senseId: item.sense_id,
      mastery: "Productive",
      fsrs: new TsFsrsScheduler().newCard(now),
    });

    const res = await submitFreeProduction(
      {
        userId: USER_A,
        senseId: item.sense_id,
        response: fx.passSentence,
        now,
      },
      deps,
    );

    expect(res.kind).toBe("judged");
    if (res.kind === "judged") {
      expect(res.passed).toBe(true);
      expect(res.rating).toBe("Good");
    }
    expect(judge.calls).toHaveLength(1);
    const logs = await cards.logsForWord(USER_A, item.sense_id);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.tier).toBe("free");
  });

  it("INV-2: a real word-absent sentence bounces — judge never called, no ReviewLog", async () => {
    const judge = new FakeJudge(passingVerdict());
    const { deps, cards } = await wire(judge);
    await cards.save({
      userId: USER_A,
      senseId: item.sense_id,
      mastery: "Productive",
      fsrs: new TsFsrsScheduler().newCard(now),
    });

    const res = await submitFreeProduction(
      {
        userId: USER_A,
        senseId: item.sense_id,
        response: fx.absentSentence,
        now,
      },
      deps,
    );

    expect(res.kind).toBe("bounce");
    if (res.kind === "bounce") expect(res.reason).toBe("absent");
    expect(judge.calls).toHaveLength(0); // RL-1: judge not reached
    expect(await cards.logsForWord(USER_A, item.sense_id)).toHaveLength(0); // INV-2: no log
  });

  it("composeFreeProduction wires the slice without throwing", async () => {
    const { cards, memo, catalog } = await makeTestStores();
    expect(() =>
      composeFreeProduction(new FakeJudge(), cards, memo, DEV_JUDGE_VERSIONS, catalog),
    ).not.toThrow();
  });
});
