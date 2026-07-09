import { describe, it, expect } from "vitest";
import { composeFreeProduction, DEV_JUDGE_VERSIONS } from "../composition.js";
import { TsFsrsScheduler } from "../tsFsrsScheduler.js";
import { FakeJudge, passingVerdict } from "../judge/fakeJudge.js";
import { makeTestStores, smokeFixtureItem } from "../testStores.js";
import { submitFreeProduction, type SubmitFreeProductionDeps } from "~/application/review/submitFreeProduction.js";
import type { DrizzleCardRepository } from "../persistence/drizzleCardRepository.js";
import { USER_A } from "../testIds.js";

/**
 * End-to-end proof of the verdict memo (spec/05 MEMO-1/4) over the REAL catalog with REAL wink +
 * ts-fsrs and a call-counting FAKE judge. The memo is invisible — it changes no gate outcome — so the
 * observable effect is purely the judge CALL COUNT: an identical resubmission is a hit (0 extra calls),
 * a genuinely different sentence is a miss (1 more call). Persistence is pglite-backed Drizzle (a real
 * memo table shared across submissions); no network/DeepSeek needed.
 */
describe("verdict memo (smoke: real catalog + wink + ts-fsrs, counting judge)", () => {
  const fx = smokeFixtureItem();
  const item = fx.item;
  const now = new Date("2026-06-30T00:00:00Z");
  // Both sentences contain the lemma so the rule layer passes and the judge/memo is reached.
  const s1 = fx.passSentence;
  const s2 = fx.altSentence;

  async function wire(
    judge: FakeJudge,
  ): Promise<{ deps: SubmitFreeProductionDeps; cards: DrizzleCardRepository }> {
    const { cards, memo, catalog } = await makeTestStores();
    // One memo table shared across all submissions in a test — the whole point (MEMO-1).
    const deps = composeFreeProduction(judge, cards, memo, DEV_JUDGE_VERSIONS, catalog);
    await cards.save({
      userId: USER_A,
      senseId: item.sense_id,
      mastery: "Productive",
      fsrs: new TsFsrsScheduler().newCard(now),
    });
    return { deps, cards };
  }

  it("MEMO-1: an identical resubmission returns the stored verdict and skips the judge call", async () => {
    const judge = new FakeJudge(passingVerdict());
    const { deps } = await wire(judge);

    const first = await submitFreeProduction({ userId: USER_A, senseId: item.sense_id, response: s1, now }, deps);
    const second = await submitFreeProduction({ userId: USER_A, senseId: item.sense_id, response: s1, now }, deps);

    expect(first.kind).toBe("judged");
    expect(second.kind).toBe("judged");
    // The judge ran ONCE; the second submission was a memo hit.
    expect(judge.calls).toHaveLength(1);
    // The gate outcome is identical either way (the memo changes nothing observable but the call count).
    if (first.kind === "judged" && second.kind === "judged") {
      expect(second.passed).toBe(first.passed);
    }
  });

  it("MEMO-4: a genuinely different sentence is a miss and invokes the judge again", async () => {
    const judge = new FakeJudge(passingVerdict());
    const { deps } = await wire(judge);

    await submitFreeProduction({ userId: USER_A, senseId: item.sense_id, response: s1, now }, deps);
    await submitFreeProduction({ userId: USER_A, senseId: item.sense_id, response: s2, now }, deps);

    // Two distinct sentences → two judge calls (no fuzzy match).
    expect(judge.calls).toHaveLength(2);
  });
});
