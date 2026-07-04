import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { ITEMS_PATH, DEV_JUDGE_VERSIONS } from "./composition.js";
import { InMemoryVerdictMemo } from "./inMemoryVerdictMemo.js";
import { JsonCatalog } from "./catalog.js";
import { InMemoryCardRepository } from "./inMemoryCardRepository.js";
import { TsFsrsScheduler } from "./tsFsrsScheduler.js";
import { WinkLemmatizer } from "./winkLemmatizer.js";
import { FakeJudge, passingVerdict } from "./fakeJudge.js";
import { TAGALOG_LEXICON } from "./tagalogLexicon.js";
import { submitFreeProduction, type SubmitFreeProductionDeps } from "../application/submitFreeProduction.js";
import type { LexicalItem } from "../domain/lexicalItem.js";

/**
 * End-to-end proof of the verdict memo (spec/05 MEMO-1/4) over the REAL catalog with REAL wink +
 * ts-fsrs and a call-counting FAKE judge. The memo is invisible — it changes no gate outcome — so the
 * observable effect is purely the judge CALL COUNT: an identical resubmission is a hit (0 extra calls),
 * a genuinely different sentence is a miss (1 more call). No network/DeepSeek needed.
 */
describe("verdict memo (smoke: real catalog + wink + ts-fsrs, counting judge)", () => {
  const items = JSON.parse(fs.readFileSync(ITEMS_PATH, "utf8")) as LexicalItem[];
  const item = items.find((i) => i.lemma === "abandon")!;
  const now = new Date("2026-06-30T00:00:00Z");
  // Both sentences contain the lemma so the rule layer passes and the judge/memo is reached.
  const s1 = "The crew decided to abandon the sinking ship before dawn.";
  const s2 = "They chose to abandon the old plan completely.";

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
      // One memo shared across all submissions in a test — the whole point (MEMO-1).
      memo: new InMemoryVerdictMemo(),
      judgeVersions: DEV_JUDGE_VERSIONS,
    };
    return { deps, cards };
  }

  async function seed(cards: InMemoryCardRepository): Promise<void> {
    await cards.save({
      userId: "u1",
      senseId: item.sense_id,
      mastery: "Productive",
      fsrs: new TsFsrsScheduler().newCard(now),
    });
  }

  it("MEMO-1: an identical resubmission returns the stored verdict and skips the judge call", async () => {
    const judge = new FakeJudge(passingVerdict());
    const { deps, cards } = wire(judge);
    await seed(cards);

    const first = await submitFreeProduction({ userId: "u1", senseId: item.sense_id, response: s1, now }, deps);
    const second = await submitFreeProduction({ userId: "u1", senseId: item.sense_id, response: s1, now }, deps);

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
    const { deps, cards } = wire(judge);
    await seed(cards);

    await submitFreeProduction({ userId: "u1", senseId: item.sense_id, response: s1, now }, deps);
    await submitFreeProduction({ userId: "u1", senseId: item.sense_id, response: s2, now }, deps);

    // Two distinct sentences → two judge calls (no fuzzy match).
    expect(judge.calls).toHaveLength(2);
  });
});
