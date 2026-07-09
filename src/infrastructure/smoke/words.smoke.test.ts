import { describe, it, expect } from "vitest";
import { composeSession, composeReviewPass, composeWords, DEV_JUDGE_VERSIONS } from "../composition.js";
import { makeTestStores } from "../testStores.js";
import { FakeJudge } from "../judge/fakeJudge.js";
import { startSession } from "../../application/session/startSession.js";
import { runReviewPass, type RunReviewPassDeps } from "../../application/review/runReviewPass.js";
import { readWordsList } from "../../application/progress/readWordsList.js";
import { readWordDetail } from "../../application/progress/readWordDetail.js";
import { USER_A } from "../testIds.js";

/**
 * Smoke test of the per-word read-models (spec/10) over the REAL catalog + REAL ts-fsrs + pglite-backed
 * Drizzle stores — no external services. Proves the wiring end-to-end: seed a session, climb a word
 * Seen → Recognized through the real `runReviewPass`, then read it back through `readWordsList` /
 * `readWordDetail` and see the mastery + replayed history reflect the persisted logs.
 */
describe("words read-models (smoke: real catalog + ts-fsrs)", () => {
  const BAND = "B2";
  const t0 = new Date("2026-07-02T00:00:00Z");
  const t1 = new Date("2026-07-03T00:00:00Z");

  it("composeWords wires without throwing", async () => {
    const { cards, catalog } = await makeTestStores();
    expect(() => composeWords(cards, catalog)).not.toThrow();
  });

  it("CNT-2/CNT-3: readWordsList lists seeded words with a real live retrievability", async () => {
    const { cards, marks, catalog, wordSource } = await makeTestStores();
    const { seeded } = await startSession(
      { userId: USER_A, frontierBand: BAND, now: t0 },
      composeSession(cards, marks, catalog, wordSource),
    );

    const { words } = await readWordsList({ userId: USER_A, now: t0 }, composeWords(cards, catalog));

    expect(words.map((w) => w.senseId).sort()).toEqual(seeded.map((c) => c.senseId).sort());
    for (const w of words) {
      expect(w.lemma.length).toBeGreaterThan(0); // catalog join produced a real lemma
      expect(w.retrievability).toBeGreaterThanOrEqual(0);
      expect(w.retrievability).toBeLessThanOrEqual(1);
      expect(w.counted).toBe(false); // freshly Seen — no judged passes yet
      expect(w.judgedPassDays).toBe(0);
    }
  });

  it("SM-3: a cloze pass shows up as a Seen → Recognized move in readWordDetail history", async () => {
    const { cards, marks, memo, catalog, wordSource } = await makeTestStores();
    const sessionDeps = composeSession(cards, marks, catalog, wordSource);
    const { seeded } = await startSession({ userId: USER_A, frontierBand: BAND, now: t0 }, sessionDeps);
    const senseId = seeded[0]!.senseId;
    const word = sessionDeps.catalog.get(senseId)!.word;

    const reviewDeps: RunReviewPassDeps = composeReviewPass(new FakeJudge(), cards, memo, DEV_JUDGE_VERSIONS, catalog);
    // Two deterministic passes: recognition (MCQ, no move) then cloze (Seen → Recognized).
    await runReviewPass({ userId: USER_A, senseId, response: word, now: t0 }, reviewDeps);
    await runReviewPass({ userId: USER_A, senseId, response: word, now: t1 }, reviewDeps);

    const detail = await readWordDetail({ userId: USER_A, senseId, now: t1 }, composeWords(cards, catalog));

    expect(detail).not.toBeNull();
    expect(detail!.mastery).toBe("Recognized");
    expect(detail!.history).toHaveLength(2);
    expect(detail!.history[0]).toMatchObject({ tier: "recognition", outcome: "pass", moved: undefined });
    expect(detail!.history[1]!.moved).toEqual({ from: "Seen", to: "Recognized" });
  });

  it("returns null from readWordDetail for a word the user has no card for", async () => {
    const { cards, catalog } = await makeTestStores();
    const detail = await readWordDetail(
      { userId: USER_A, senseId: "not_a_real_sense_99", now: t0 },
      composeWords(cards, catalog),
    );
    expect(detail).toBeNull();
  });
});
