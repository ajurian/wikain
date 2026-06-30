import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { ITEMS_PATH, composeFreeProduction } from "./composition.js";
import { JsonCatalog } from "./catalog.js";
import { InMemoryCardRepository } from "./inMemoryCardRepository.js";
import { TsFsrsScheduler } from "./tsFsrsScheduler.js";
import { WinkLemmatizer } from "./winkLemmatizer.js";
import { FakeJudge, passingVerdict } from "./fakeJudge.js";
import { TAGALOG_LEXICON } from "./tagalogLexicon.js";
import { submitFreeProduction, type SubmitFreeProductionDeps } from "../application/submitFreeProduction.js";
import type { LexicalItem } from "../domain/lexicalItem.js";

/**
 * End-to-end smoke test of the judged free-production slice over the REAL catalog with REAL wink +
 * ts-fsrs and a FAKE judge — the architecture-proving path (RL-1..RL-4, JDG-2, INV-1, INV-2, SM-6).
 * No network/auth/DeepSeek needed.
 */
describe("free-production slice (smoke: real catalog + wink + ts-fsrs, fake judge)", () => {
  const items = JSON.parse(fs.readFileSync(ITEMS_PATH, "utf8")) as LexicalItem[];
  const item = items.find((i) => i.lemma === "abandon")!; // model_sentence present
  const now = new Date("2026-06-30T00:00:00Z");

  function wire(judge: FakeJudge): { deps: SubmitFreeProductionDeps; cards: InMemoryCardRepository } {
    const wink = new WinkLemmatizer();
    const cards = new InMemoryCardRepository();
    const deps: SubmitFreeProductionDeps = {
      catalog: new JsonCatalog(items),
      cards,
      scheduler: new TsFsrsScheduler(),
      lemmatizer: wink,
      analyzer: wink,
      judge,
      tagalogLexicon: TAGALOG_LEXICON,
    };
    return { deps, cards };
  }

  it("JDG-2/INV-1: a real gate-passing sentence yields exactly one Good rating + one ReviewLog", async () => {
    const judge = new FakeJudge(passingVerdict());
    const { deps, cards } = wire(judge);
    await cards.save({
      userId: "u1",
      senseId: item.sense_id,
      mastery: "Productive",
      fsrs: new TsFsrsScheduler().newCard(now),
    });

    const res = await submitFreeProduction(
      {
        userId: "u1",
        senseId: item.sense_id,
        response: "The crew decided to abandon the sinking ship before dawn.",
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
    expect(cards.reviewLogs).toHaveLength(1);
    expect(cards.reviewLogs[0]?.tier).toBe("free");
  });

  it("INV-2: a real word-absent sentence bounces — judge never called, no ReviewLog", async () => {
    const judge = new FakeJudge(passingVerdict());
    const { deps, cards } = wire(judge);
    await cards.save({
      userId: "u1",
      senseId: item.sense_id,
      mastery: "Productive",
      fsrs: new TsFsrsScheduler().newCard(now),
    });

    const res = await submitFreeProduction(
      {
        userId: "u1",
        senseId: item.sense_id,
        response: "The crew decided to leave the sinking ship before dawn.",
        now,
      },
      deps,
    );

    expect(res.kind).toBe("bounce");
    if (res.kind === "bounce") expect(res.reason).toBe("absent");
    expect(judge.calls).toHaveLength(0); // RL-1: judge not reached
    expect(cards.reviewLogs).toHaveLength(0); // INV-2: no log
  });

  it("composeFreeProduction wires the slice without throwing", () => {
    expect(() => composeFreeProduction(new FakeJudge())).not.toThrow();
  });
});
