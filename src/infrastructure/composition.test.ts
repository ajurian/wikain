import { describe, it, expect } from "vitest";
import { composeCuedReview } from "./composition.js";
import { TsFsrsScheduler } from "./tsFsrsScheduler.js";
import { makeTestStores } from "./testStores.js";
import { submitCuedReview } from "~/application/review/submitCuedReview.js";
import { USER_A } from "./testIds.js";

/**
 * End-to-end smoke test of the cued-review slice over the REAL catalog with REAL ts-fsrs — the
 * architecture-proving path (TIER-3, RAT-1, SM-4, RAT-8, INV-3). Persistence is pglite-backed
 * Drizzle; NLP is the FakeAnalyzer (spaCy is out-of-process now), and no network/auth/judge is needed.
 */
describe("cued-review slice (smoke: real catalog + ts-fsrs)", () => {
  it("grades a correct cued response, promotes Recognized → Productive, schedules, and logs", async () => {
    const { cards, items, catalog, analyzer } = await makeTestStores();
    expect(items.length).toBeGreaterThan(0);
    const item = items[0]!;

    const deps = composeCuedReview(cards, catalog, analyzer);
    const now = new Date("2026-06-30T00:00:00Z");
    await cards.save({
      userId: USER_A,
      senseId: item.sense_id,
      mastery: "Recognized",
      fsrs: new TsFsrsScheduler().newCard(now),
    });

    const res = await submitCuedReview(
      { userId: USER_A, senseId: item.sense_id, response: item.lemma, now },
      deps,
    );

    expect(res.passed).toBe(true); // TIER-3/TIER-5: the bare lemma matches
    expect(res.rating).toBe("Good"); // RAT-1
    expect(res.mastery).toBe("Productive"); // SM-4
    expect(res.due.getTime()).toBeGreaterThan(now.getTime()); // rescheduled into the future
    expect(await cards.logsForWord(USER_A, item.sense_id)).toHaveLength(1); // RAT-8
  });
});
