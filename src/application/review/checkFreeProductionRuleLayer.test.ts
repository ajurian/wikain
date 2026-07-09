import { describe, it, expect } from "vitest";
import {
  checkFreeProductionRuleLayer,
  type CheckFreeProductionRuleLayerDeps,
} from "./checkFreeProductionRuleLayer.js";
import type { LexicalItem } from "../../domain/lexicalItem.js";
import type { NlpToken } from "../../domain/review/ruleLayer.js";
import type { Catalog } from "../ports/catalog.js";
import type { Lemmatizer } from "../ports/lemmatizer.js";
import type { SentenceAnalyzer } from "../ports/sentenceAnalyzer.js";
import { MAX_RULE_BOUNCE_RETRIES } from "../../domain/constants.js";

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
    gen_model: "test",
    gen_spec_version: "test",
  };
}

const catalog: Catalog = { get: (id) => (id === SENSE ? makeItem() : undefined) };

const lemmatizer: Lemmatizer = {
  formsOf: (text) => text.toLowerCase().split(/\s+/).filter(Boolean),
};

/** A healthy, non-degenerate token set (≥4 non-target content tokens + a VERB) for any text. */
const healthyAnalyzer: SentenceAnalyzer = {
  analyze: (): NlpToken[] => [
    { normal: "she", lemma: "she", pos: "PRON", isStopword: true, isWord: true },
    { normal: "negotiated", lemma: "negotiate", pos: "VERB", isStopword: false, isWord: true },
    { normal: "better", lemma: "better", pos: "ADJ", isStopword: false, isWord: true },
    { normal: "contract", lemma: "contract", pos: "NOUN", isStopword: false, isWord: true },
    { normal: "price", lemma: "price", pos: "NOUN", isStopword: false, isWord: true },
    { normal: "yesterday", lemma: "yesterday", pos: "ADV", isStopword: false, isWord: true },
  ],
};

function deps(
  analyzer: SentenceAnalyzer = healthyAnalyzer,
  tagalogLexicon: ReadonlySet<string> = new Set(),
): CheckFreeProductionRuleLayerDeps {
  return { catalog, lemmatizer, analyzer, tagalogLexicon };
}

describe("checkFreeProductionRuleLayer", () => {
  it("RL-1: a healthy sentence containing the lemma passes to the judge (ok)", () => {
    const res = checkFreeProductionRuleLayer(
      { senseId: SENSE, response: "she negotiate a better contract price" },
      deps(),
    );
    expect(res).toEqual({ ok: true });
  });

  it("RL-2: a sentence missing the target lemma bounces 'absent'", () => {
    const res = checkFreeProductionRuleLayer(
      { senseId: SENSE, response: "she bought a house yesterday" },
      deps(),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.bounce.reason).toBe("absent");
  });

  it("RL-3: a degenerate (too-short) response bounces 'degenerate'", () => {
    const shortAnalyzer: SentenceAnalyzer = {
      analyze: (): NlpToken[] => [
        { normal: "negotiate", lemma: "negotiate", pos: "VERB", isStopword: false, isWord: true },
      ],
    };
    const res = checkFreeProductionRuleLayer(
      { senseId: SENSE, response: "negotiate" },
      deps(shortAnalyzer),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.bounce.reason).toBe("degenerate");
  });

  it("RL-4: a Taglish sentence bounces 'taglish'", () => {
    const taglishAnalyzer: SentenceAnalyzer = {
      analyze: (): NlpToken[] => [
        ...healthyAnalyzer.analyze(""),
        { normal: "talaga", lemma: "talaga", pos: "ADV", isStopword: false, isWord: true },
      ],
    };
    const res = checkFreeProductionRuleLayer(
      { senseId: SENSE, response: "she negotiate a better contract price talaga" },
      deps(taglishAnalyzer, new Set(["talaga"])),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.bounce.reason).toBe("taglish");
  });

  it("RL-6: reaching MAX_RULE_BOUNCE_RETRIES flags revealModelSentence; below the cap it does not", () => {
    const belowCap = checkFreeProductionRuleLayer(
      { senseId: SENSE, response: "she bought a house", priorBounces: 0 },
      deps(),
    );
    expect(belowCap.ok).toBe(false);
    if (!belowCap.ok) {
      expect(belowCap.bounce.bounces).toBe(1);
      expect(belowCap.bounce.revealModelSentence).toBe(false);
    }

    const atCap = checkFreeProductionRuleLayer(
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
