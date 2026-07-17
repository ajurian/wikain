import { describe, it, expect } from "vitest";
import {
  checkFreeProductionRuleLayer,
  type CheckFreeProductionRuleLayerDeps,
} from "./checkFreeProductionRuleLayer.js";
import type { LexicalItem } from "~/domain/lexicalItem.js";
import type { NlpToken } from "~/domain/review/ruleLayer.js";
import type { Catalog } from "../ports/catalog.js";
import type { SentenceAnalyzer } from "../ports/sentenceAnalyzer.js";
import { MAX_RULE_BOUNCE_RETRIES } from "~/domain/constants.js";

const SENSE = "negotiate_verb_01";

function makeItem(): LexicalItem {
  return {
    word: "negotiate",
    lemma: "negotiate",
    part_of_speech: "verb",
    sense_id: SENSE,
    cefr: "B1",
    zipf: 4.0,
    zipf_rank: 1000,
    intended_sense: "to reach agreement by discussion",
    recognition_meaning: null,
    distractors: null,
    clozed_sentence: null,
    productive_meaning: "to reach an agreement by discussion",
    model_sentence: null,
    self_reference_prompt: null,
    cloze_fit_set: null,
    bounce_gloss: null,
    fit_set_version: null,
    gen_model: "test",
    gen_spec_version: "test",
  };
}

const catalog: Catalog = { get: (id) => (id === SENSE ? makeItem() : undefined) };

const POS: Readonly<Record<string, string>> = {
  she: "PRON",
  a: "DET",
  negotiate: "VERB",
  negotiated: "VERB",
  bought: "VERB",
  better: "ADJ",
  contract: "NOUN",
  price: "NOUN",
  house: "NOUN",
  yesterday: "ADV",
  talaga: "ADV",
};
const LEMMAS: Readonly<Record<string, string>> = { negotiated: "negotiate", bought: "buy" };
const STOPWORDS: ReadonlySet<string> = new Set(["she", "a"]);

/**
 * A text-DRIVEN analyzer. It must be: `formsOf` (RL-2 presence) is now derived from these very tokens,
 * so a fixed token set would smuggle the target into every response and the "absent" bounce could
 * never fire.
 */
const analyzer: SentenceAnalyzer = {
  analyze: (text: string): Promise<NlpToken[]> =>
    Promise.resolve(
      text
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => ({
          normal: w,
          lemma: LEMMAS[w] ?? w,
          pos: POS[w] ?? "NOUN",
          isStopword: STOPWORDS.has(w),
          isWord: true,
        })),
    ),
};

function deps(
  a: SentenceAnalyzer = analyzer,
  tagalogLexicon: ReadonlySet<string> = new Set(),
): CheckFreeProductionRuleLayerDeps {
  return { catalog, analyzer: a, tagalogLexicon };
}

describe("checkFreeProductionRuleLayer", () => {
  it("RL-1: a healthy sentence containing the lemma passes to the judge (ok)", async () => {
    const res = await checkFreeProductionRuleLayer(
      { senseId: SENSE, response: "she negotiate a better contract price yesterday" },
      deps(),
    );
    expect(res).toEqual({ ok: true });
  });

  it("RL-2: a sentence missing the target lemma bounces 'absent'", async () => {
    const res = await checkFreeProductionRuleLayer(
      { senseId: SENSE, response: "she bought a house yesterday" },
      deps(),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.bounce.reason).toBe("absent");
  });

  it("RL-3: a degenerate (too-short) response bounces 'degenerate'", async () => {
    const res = await checkFreeProductionRuleLayer(
      { senseId: SENSE, response: "negotiate" },
      deps(),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.bounce.reason).toBe("degenerate");
  });

  it("RL-4: a Taglish sentence bounces 'taglish'", async () => {
    const res = await checkFreeProductionRuleLayer(
      { senseId: SENSE, response: "she negotiate a better contract price yesterday talaga" },
      deps(analyzer, new Set(["talaga"])),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.bounce.reason).toBe("taglish");
  });

  it("RL-6: reaching MAX_RULE_BOUNCE_RETRIES flags revealModelSentence; below the cap it does not", async () => {
    const belowCap = await checkFreeProductionRuleLayer(
      { senseId: SENSE, response: "she bought a house", priorBounces: 0 },
      deps(),
    );
    expect(belowCap.ok).toBe(false);
    if (!belowCap.ok) {
      expect(belowCap.bounce.bounces).toBe(1);
      expect(belowCap.bounce.revealModelSentence).toBe(false);
    }

    const atCap = await checkFreeProductionRuleLayer(
      { senseId: SENSE, response: "she bought a house", priorBounces: MAX_RULE_BOUNCE_RETRIES - 1 },
      deps(),
    );
    expect(atCap.ok).toBe(false);
    if (!atCap.ok) {
      expect(atCap.bounce.bounces).toBe(MAX_RULE_BOUNCE_RETRIES);
      expect(atCap.bounce.revealModelSentence).toBe(true);
    }
  });
});
