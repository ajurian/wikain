import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { ITEMS_PATH, composeReviewPass } from "./composition.js";
import { JsonCatalog } from "./catalog.js";
import { InMemoryCardRepository } from "./inMemoryCardRepository.js";
import { TsFsrsScheduler } from "./tsFsrsScheduler.js";
import { WinkLemmatizer } from "./winkLemmatizer.js";
import { FakeJudge, passingVerdict } from "./fakeJudge.js";
import { TAGALOG_LEXICON } from "./tagalogLexicon.js";
import { runReviewPass, type RunReviewPassDeps } from "../application/runReviewPass.js";
import type { LexicalItem } from "../domain/lexicalItem.js";
import type { MasteryState } from "../domain/card.js";

/**
 * End-to-end smoke test of the loop orchestrator (spec/11) over the REAL catalog with REAL wink +
 * ts-fsrs and a FAKE judge — proving tier routing (LOOP-1/SM-1): a Recognized card takes the
 * deterministic cued branch with NO judge call (LOOP-2), a Productive card takes the judged branch
 * (LOOP-3/LOOP-4). No network/auth/DeepSeek needed.
 */
describe("end-to-end loop (smoke: real catalog + wink + ts-fsrs, fake judge)", () => {
  const items = JSON.parse(fs.readFileSync(ITEMS_PATH, "utf8")) as LexicalItem[];
  const item = items.find((i) => i.lemma === "abandon")!; // model_sentence present
  const now = new Date("2026-06-30T00:00:00Z");

  async function wire(
    judge: FakeJudge,
    mastery: MasteryState,
  ): Promise<{ deps: RunReviewPassDeps; cards: InMemoryCardRepository }> {
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
    await cards.save({ userId: "u1", senseId: item.sense_id, mastery, fsrs: new TsFsrsScheduler().newCard(now) });
    return { deps, cards };
  }

  it("LOOP-1/LOOP-2: a Recognized card routes to the cued branch and makes no judge call", async () => {
    const judge = new FakeJudge(passingVerdict());
    const { deps, cards } = await wire(judge, "Recognized");

    const res = await runReviewPass(
      { userId: "u1", senseId: item.sense_id, response: "abandon", now },
      deps,
    );

    expect(res.tier).toBe("cued");
    if (res.tier === "cued") {
      expect(res.outcome.passed).toBe(true);
      expect(res.outcome.mastery).toBe("Productive"); // SM-4
    }
    expect(judge.calls).toHaveLength(0); // LOOP-2: deterministic, no LLM
    expect(cards.reviewLogs).toHaveLength(1);
    expect(cards.reviewLogs[0]?.tier).toBe("cued");
  });

  it("LOOP-1/LOOP-4: a Productive card routes to the judged branch and rates on a real gate-passing sentence", async () => {
    const judge = new FakeJudge(passingVerdict());
    const { deps, cards } = await wire(judge, "Productive");

    const res = await runReviewPass(
      {
        userId: "u1",
        senseId: item.sense_id,
        response: "The crew decided to abandon the sinking ship before dawn.",
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
    expect(cards.reviewLogs).toHaveLength(1);
    expect(cards.reviewLogs[0]?.tier).toBe("free");
  });

  it("composeReviewPass wires the loop without throwing", () => {
    expect(() => composeReviewPass(new FakeJudge())).not.toThrow();
  });
});
