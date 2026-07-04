import { describe, it, expect } from "vitest";
import { composeSession, composeReviewPass, composeWords } from "./composition.js";
import { InMemoryCardRepository } from "./inMemoryCardRepository.js";
import { FakeJudge } from "./fakeJudge.js";
import { startSession } from "../application/startSession.js";
import { runReviewPass, type RunReviewPassDeps } from "../application/runReviewPass.js";
import { readWordsList } from "../application/readWordsList.js";
import { readWordDetail } from "../application/readWordDetail.js";

/**
 * Smoke test of the per-word read-models (spec/10) over the REAL catalog + REAL ts-fsrs + an in-memory
 * repo — no external services. Proves the wiring end-to-end: seed a session, climb a word Seen →
 * Recognized through the real `runReviewPass`, then read it back through `readWordsList` /
 * `readWordDetail` and see the mastery + replayed history reflect the persisted logs.
 */
describe("words read-models (smoke: real catalog + ts-fsrs)", () => {
  const BAND = "B2";
  const t0 = new Date("2026-07-02T00:00:00Z");
  const t1 = new Date("2026-07-03T00:00:00Z");
  const USER = "u1";

  it("composeWords wires without throwing", () => {
    expect(() => composeWords()).not.toThrow();
  });

  it("CNT-2/CNT-3: readWordsList lists seeded words with a real live retrievability", async () => {
    const cards = new InMemoryCardRepository();
    const { seeded } = await startSession({ userId: USER, frontierBand: BAND, now: t0 }, composeSession(cards));

    const { words } = await readWordsList({ userId: USER, now: t0 }, composeWords(cards));

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
    const cards = new InMemoryCardRepository();
    const sessionDeps = composeSession(cards);
    const { seeded } = await startSession({ userId: USER, frontierBand: BAND, now: t0 }, sessionDeps);
    const senseId = seeded[0]!.senseId;
    const word = sessionDeps.catalog.get(senseId)!.word;

    const reviewDeps: RunReviewPassDeps = { ...composeReviewPass(new FakeJudge()), cards };
    // Two deterministic passes: recognition (MCQ, no move) then cloze (Seen → Recognized).
    await runReviewPass({ userId: USER, senseId, response: word, now: t0 }, reviewDeps);
    await runReviewPass({ userId: USER, senseId, response: word, now: t1 }, reviewDeps);

    const detail = await readWordDetail({ userId: USER, senseId, now: t1 }, composeWords(cards));

    expect(detail).not.toBeNull();
    expect(detail!.mastery).toBe("Recognized");
    expect(detail!.history).toHaveLength(2);
    expect(detail!.history[0]).toMatchObject({ tier: "recognition", outcome: "pass", moved: undefined });
    expect(detail!.history[1]!.moved).toEqual({ from: "Seen", to: "Recognized" });
  });

  it("returns null from readWordDetail for a word the user has no card for", async () => {
    const cards = new InMemoryCardRepository();
    const detail = await readWordDetail(
      { userId: USER, senseId: "not_a_real_sense_99", now: t0 },
      composeWords(cards),
    );
    expect(detail).toBeNull();
  });
});
