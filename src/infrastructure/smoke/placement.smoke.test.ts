import { describe, it, expect } from "vitest";
import { recordCoarseLevel } from "~/application/placement/recordCoarseLevel.js";
import { recordLexTaleResult } from "~/application/placement/recordLexTaleResult.js";
import { readPlacementProfile } from "~/application/placement/readPlacementProfile.js";
import { seedIntroductions } from "~/application/session/seedIntroductions.js";
import { composeSeeding } from "../composition.js";
import { makeTestStores } from "../testStores.js";
import { LEXTALE_ITEMS } from "~/domain/placement/lextale.js";
import { USER_A } from "../testIds.js";

/** A perfect LexTALE run ⇒ score 100 ⇒ the C1 frontier. */
const perfectRun = new Map(LEXTALE_ITEMS.map((i) => [i.item, i.isWord]));

/**
 * spec/09 SEED-2/3/4: the `/placement` retune, over the real composition (pglite-backed Drizzle stores + the
 * DB-backed catalog and word source).
 *
 * The load-bearing assertion is the middle one: a retune moves WHERE the next words come from and nothing
 * else. Rewriting a learner's existing cards to match a new band would discard their FSRS schedule and
 * contradict the append-only review log (DM-6) — the exact thing SEED-3's "LexTALE does not select words"
 * separation exists to prevent.
 */
describe("retuning the frontier band (SEED-2 mechanism i)", () => {
  it("SEED-4: a coarse retune clears the stale LexTALE scalar and moves the band", async () => {
    const { profile } = await makeTestStores();

    await recordLexTaleResult({ userId: USER_A, answers: perfectRun }, { profile });
    expect(await readPlacementProfile({ userId: USER_A }, { profile })).toMatchObject({
      frontierBand: "C1",
      lextaleScore: 100,
    });

    await recordCoarseLevel({ userId: USER_A, level: "b1" }, { profile });

    expect(await readPlacementProfile({ userId: USER_A }, { profile })).toMatchObject({
      frontierBand: "B1",
      lextaleScore: null, // the band no longer came from the instrument
    });
  });

  it("SEED-3/DM-6: a retune leaves every existing card untouched — schedule, mastery and all", async () => {
    const { cards, marks, profile, catalog, wordSource } = await makeTestStores();
    const seedDeps = composeSeeding(cards, marks, catalog, wordSource);

    // A learner placed at C1 who already has cards.
    const { frontierBand } = await recordLexTaleResult(
      { userId: USER_A, answers: perfectRun },
      { profile },
    );
    await seedIntroductions({ userId: USER_A, frontierBand }, seedDeps);
    const before = (await cards.listCards(USER_A)).map((c) => ({
      senseId: c.senseId,
      mastery: c.mastery,
      due: c.fsrs.due.getTime(),
      stability: c.fsrs.stability,
      reps: c.fsrs.reps,
    }));
    expect(before.length).toBeGreaterThan(0);

    await recordCoarseLevel({ userId: USER_A, level: "b1" }, { profile });

    const after = (await cards.listCards(USER_A)).map((c) => ({
      senseId: c.senseId,
      mastery: c.mastery,
      due: c.fsrs.due.getTime(),
      stability: c.fsrs.stability,
      reps: c.fsrs.reps,
    }));
    expect(after).toEqual(before); // byte-for-byte: a retune is not a reset
  });

  it("SEED-2/5: the NEXT introductions come from the retuned band, not the old one", async () => {
    const { cards, marks, profile, catalog, wordSource, items } = await makeTestStores();
    const seedDeps = composeSeeding(cards, marks, catalog, wordSource);

    // First session at C1 (from LexTALE).
    const { frontierBand: c1 } = await recordLexTaleResult(
      { userId: USER_A, answers: perfectRun },
      { profile },
    );
    const firstBatch = await seedIntroductions({ userId: USER_A, frontierBand: c1 }, seedDeps);
    expect(firstBatch.length).toBeGreaterThan(0);

    // Simulate the learner actually reviewing them: a fresh card is due immediately, and SEED-6 caps new
    // intros at NEW_FRACTION_UNDER_BACKLOG of the session, so with an untouched backlog the pacer would
    // correctly allow ZERO new words and this test would prove nothing about the band.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    for (const card of firstBatch) {
      await cards.save({ ...card, fsrs: { ...card.fsrs, due: tomorrow } });
    }

    // The learner finds C1 too hard and retunes down.
    const b1 = await recordCoarseLevel({ userId: USER_A, level: "b1" }, { profile });
    expect(b1).toBe("B1");

    // A later session reads the persisted band (as `startSessionFn` does) and seeds there.
    const { frontierBand } = await readPlacementProfile({ userId: USER_A }, { profile });
    const secondBatch = await seedIntroductions({ userId: USER_A, frontierBand }, seedDeps);

    expect(secondBatch.length).toBeGreaterThan(0);
    const b1SenseIds = new Set(items.filter((i) => i.cefr === "B1").map((i) => i.sense_id));
    expect(secondBatch.every((c) => b1SenseIds.has(c.senseId))).toBe(true);
    // And the C1 words seeded before the retune are still there — a retune adds, it never removes.
    const all = await cards.listCards(USER_A);
    expect(firstBatch.every((f) => all.some((c) => c.senseId === f.senseId))).toBe(true);
  });
});
