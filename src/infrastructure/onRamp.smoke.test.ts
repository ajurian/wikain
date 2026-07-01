import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { ITEMS_PATH } from "./composition.js";
import { JsonCatalog } from "./catalog.js";
import { InMemoryCardRepository } from "./inMemoryCardRepository.js";
import { TsFsrsScheduler } from "./tsFsrsScheduler.js";
import { WinkLemmatizer } from "./winkLemmatizer.js";
import { FakeJudge } from "./fakeJudge.js";
import { TAGALOG_LEXICON } from "./tagalogLexicon.js";
import { runReviewPass, type RunReviewPassDeps } from "../application/runReviewPass.js";
import type { LexicalItem } from "../domain/lexicalItem.js";

/**
 * End-to-end smoke test of the `Seen` on-ramp (spec/03 + SM-3 + RAT-7) over the REAL catalog with REAL
 * wink + ts-fsrs. It proves the ladder is now continuous: a freshly-introduced `Seen` word climbs
 * `Seen → Recognized → Productive` entirely through the deterministic tiers, with NO judge/LLM call
 * anywhere on that climb (the FakeJudge must record zero calls). This is the acceptance proof that
 * `runReviewPass` no longer dead-ends on `Seen`.
 */
describe("Seen on-ramp climb (smoke: real catalog + wink + ts-fsrs, no judge)", () => {
  const items = JSON.parse(fs.readFileSync(ITEMS_PATH, "utf8")) as LexicalItem[];
  const item = items.find((i) => i.lemma === "abandon")!;

  it("SM-3: a Seen word climbs recognition → cloze → cued to Productive, never calling the judge", async () => {
    const judge = new FakeJudge();
    const wink = new WinkLemmatizer();
    const cards = new InMemoryCardRepository();
    const deps: RunReviewPassDeps = {
      catalog: new JsonCatalog(items),
      cards,
      scheduler: new TsFsrsScheduler(),
      lemmatizer: wink,
      analyzer: wink,
      judge,
      tagalogLexicon: TAGALOG_LEXICON,
    };

    const userId = "u1";
    const senseId = item.sense_id;
    await cards.save({
      userId,
      senseId,
      mastery: "Seen",
      fsrs: new TsFsrsScheduler().newCard(new Date("2026-07-01T00:00:00Z")),
    });

    // Rep 1 — first Seen presentation is the meaning→word MCQ; picking the target word passes but an
    // MCQ pass alone does NOT promote (SM-3).
    const rec = await runReviewPass(
      { userId, senseId, response: item.word, now: new Date("2026-07-01T00:00:00Z") },
      deps,
    );
    expect(rec.tier).toBe("recognition");
    if (rec.tier === "recognition") expect(rec.outcome.mastery).toBe("Seen");

    // Rep 2 — after the prior MCQ pass the on-ramp advances to the typed cloze; a correct answer
    // promotes Seen → Recognized (SM-3, promotion fires on the cloze pass).
    const cloze = await runReviewPass(
      { userId, senseId, response: item.word, now: new Date("2026-07-05T00:00:00Z") },
      deps,
    );
    expect(cloze.tier).toBe("cloze");
    if (cloze.tier === "cloze") expect(cloze.outcome.mastery).toBe("Recognized");

    // Rep 3 — Recognized now routes to the deterministic cued tier; one cued pass promotes to
    // Productive (SM-4), proving the ladder is continuous from introduction.
    const cued = await runReviewPass(
      { userId, senseId, response: item.word, now: new Date("2026-07-12T00:00:00Z") },
      deps,
    );
    expect(cued.tier).toBe("cued");
    if (cued.tier === "cued") expect(cued.outcome.mastery).toBe("Productive");

    // The entire on-ramp climb is deterministic — the judge was never reached.
    expect(judge.calls).toHaveLength(0);
    // One ReviewLog per rated rep, in order (DM-6): recognition, cloze, cued.
    expect(cards.reviewLogs.map((l) => l.tier)).toEqual(["recognition", "cloze", "cued"]);
  });
});
