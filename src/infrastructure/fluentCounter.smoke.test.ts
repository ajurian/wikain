import { describe, it, expect } from "vitest";
import { composeReviewPass, DEV_JUDGE_VERSIONS } from "./composition.js";
import { TsFsrsScheduler } from "./tsFsrsScheduler.js";
import { FakeJudge, passingVerdict } from "./fakeJudge.js";
import { makeTestStores, smokeFixtureItem } from "./testStores.js";
import { runReviewPass, type RunReviewPassDeps } from "../application/review/runReviewPass.js";
import { readUsableCounter } from "../application/progress/readUsableCounter.js";
import type { DrizzleCardRepository } from "./drizzleCardRepository.js";
import type { Card, FsrsCardState } from "../domain/mastery/card.js";
import { USER_A } from "./testIds.js";

/**
 * End-to-end smoke test (spec/01 SM-5 + spec/10 counter) over the REAL catalog with REAL wink +
 * ts-fsrs and a FAKE judge — no network/auth/DeepSeek. Proves the productive top end of the loop:
 * three spaced judged passes promote Productive → Fluent (SM-5), the counter includes a word after
 * two spaced passes (CNT-2/CNT-6), and the counter ticks down once retrievability decays (CNT-3/4).
 * Persistence is pglite-backed Drizzle.
 */
describe("SM-5 promotion + counter (smoke: real catalog + wink + ts-fsrs, fake judge)", () => {
  const fx = smokeFixtureItem();
  const item = fx.item;
  const USER = USER_A;
  const PASS = fx.passSentence;

  /** A seasoned Review-state card (stability well over FLUENT_MIN_STABILITY_DAYS) at Productive. */
  function seasonedCard(): Card {
    const fsrs: FsrsCardState = {
      due: new Date("2026-06-01T00:00:00Z"),
      stability: 40,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 6,
      lapses: 0,
      state: 2,
    };
    return { userId: USER, senseId: item.sense_id, mastery: "Productive", fsrs };
  }

  async function wire(): Promise<{
    deps: RunReviewPassDeps;
    cards: DrizzleCardRepository;
    scheduler: TsFsrsScheduler;
  }> {
    const { cards, memo, catalog } = await makeTestStores();
    const deps = composeReviewPass(new FakeJudge(passingVerdict()), cards, memo, DEV_JUDGE_VERSIONS, catalog);
    // TsFsrsScheduler is stateless; a fresh instance gives the same live retrievability the counter reads.
    return { deps, cards, scheduler: new TsFsrsScheduler() };
  }

  async function pass(deps: RunReviewPassDeps, now: Date): Promise<void> {
    const res = await runReviewPass({ userId: USER, senseId: item.sense_id, response: PASS, now }, deps);
    expect(res.tier).toBe("free");
    if (res.tier === "free") expect(res.outcome.kind).toBe("judged");
  }

  it("SM-5: three spaced unscaffolded judged passes promote Productive → Fluent", async () => {
    const { deps, cards } = await wire();
    await cards.save(seasonedCard());

    await pass(deps, new Date("2026-06-01T09:00:00Z"));
    expect((await cards.load(USER, item.sense_id))!.mastery).toBe("Productive"); // 1 day < 3

    await pass(deps, new Date("2026-06-09T09:00:00Z"));
    expect((await cards.load(USER, item.sense_id))!.mastery).toBe("Productive"); // 2 days < 3

    await pass(deps, new Date("2026-06-17T09:00:00Z"));
    expect((await cards.load(USER, item.sense_id))!.mastery).toBe("Fluent"); // 3rd spaced pass
  });

  it("CNT-2/CNT-6: the word is counted after two spaced judged passes while retrievability is high", async () => {
    const { deps, cards, scheduler } = await wire();
    await cards.save(seasonedCard());

    const day2 = new Date("2026-06-09T09:00:00Z");
    await pass(deps, new Date("2026-06-01T09:00:00Z"));
    await pass(deps, day2);

    // Read right after the 2nd pass — freshly reviewed, retrievability is high.
    const res = await readUsableCounter({ userId: USER, now: day2 }, { cards, scheduler });
    expect(res.count).toBe(1);
    expect(res.senseIds).toEqual([item.sense_id]);
  });

  it("CNT-3/CNT-4: the counter ticks down once retrievability decays below the floor", async () => {
    const { deps, cards, scheduler } = await wire();
    await cards.save(seasonedCard());

    await pass(deps, new Date("2026-06-01T09:00:00Z"));
    await pass(deps, new Date("2026-06-09T09:00:00Z"));

    // Read far in the future, no review in between: retrievability has decayed below COUNTER_R_FLOOR.
    const res = await readUsableCounter({ userId: USER, now: new Date("2027-06-09T09:00:00Z") }, { cards, scheduler });
    expect(res.count).toBe(0);
  });
});
