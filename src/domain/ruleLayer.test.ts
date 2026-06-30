import { describe, it, expect } from "vitest";
import { checkRuleLayer, type NlpToken, type RuleLayerInput } from "./ruleLayer.js";

const NO_TAGALOG: ReadonlySet<string> = new Set();

/** Build a content-word token (NOUN by default) with sensible defaults. */
function tok(normal: string, pos = "NOUN", overrides: Partial<NlpToken> = {}): NlpToken {
  return { normal, lemma: normal, pos, isStopword: false, isWord: true, ...overrides };
}

function input(overrides: Partial<RuleLayerInput>): RuleLayerInput {
  return {
    targetLemma: "negotiate",
    responseForms: [],
    responseTokens: [],
    modelSentenceWords: null,
    tagalogLexicon: NO_TAGALOG,
    ...overrides,
  };
}

/** A non-degenerate, all-English carrier sentence containing the target — the "proceeds" baseline. */
function healthyTokens(): NlpToken[] {
  return [
    tok("she", "PRON", { isStopword: true }),
    tok("negotiated", "VERB", { lemma: "negotiate" }),
    tok("a", "DET", { isStopword: true }),
    tok("better", "ADJ"),
    tok("contract", "NOUN"),
    tok("price", "NOUN"),
    tok("yesterday", "ADV"),
    tok(".", "PUNCT", { isWord: false }),
  ];
}

describe("RL-2 target presence (lemma match)", () => {
  it("an inflected form counts as present and proceeds (not bounced)", () => {
    const res = checkRuleLayer(
      input({ responseForms: ["negotiated", "negotiate"], responseTokens: healthyTokens() }),
    );
    expect(res).toEqual({ ok: true });
  });

  it("a truly absent target bounces as 'absent'", () => {
    const res = checkRuleLayer(
      input({ responseForms: ["she", "bought", "a", "house"], responseTokens: healthyTokens() }),
    );
    expect(res).toEqual({ ok: false, reason: "absent" });
  });
});

describe("RL-3 degeneracy", () => {
  it("fewer than 4 content tokens (excluding the target) bounces", () => {
    // Only "ran" + "fast" are content tokens besides the target → 2 < 4.
    const tokens: NlpToken[] = [
      tok("she", "PRON", { isStopword: true }),
      tok("negotiate", "VERB", { lemma: "negotiate" }),
      tok("ran", "VERB", { lemma: "run" }),
      tok("fast", "ADV"),
    ];
    const res = checkRuleLayer(input({ responseForms: ["negotiate"], responseTokens: tokens }));
    expect(res).toEqual({ ok: false, reason: "degenerate" });
  });

  it("no finite verb bounces", () => {
    const tokens: NlpToken[] = [
      tok("a", "DET", { isStopword: true }),
      tok("long", "ADJ"),
      tok("hard", "ADJ"),
      tok("public", "ADJ"),
      tok("negotiation", "NOUN", { lemma: "negotiation" }),
    ];
    // "negotiate" lemma is present via forms even though no VERB token exists.
    const res = checkRuleLayer(input({ responseForms: ["negotiate"], responseTokens: tokens }));
    expect(res).toEqual({ ok: false, reason: "degenerate" });
  });

  it("a near-verbatim copy of model_sentence bounces", () => {
    const tokens = healthyTokens();
    const modelWords = tokens.filter((t) => t.isWord).map((t) => t.normal); // identical → Jaccard 1.0
    const res = checkRuleLayer(
      input({ responseForms: ["negotiate"], responseTokens: tokens, modelSentenceWords: modelWords }),
    );
    expect(res).toEqual({ ok: false, reason: "degenerate" });
  });
});

describe("RL-4 language / code-switching", () => {
  it("a Tagalog word triggers a 'taglish' nudge", () => {
    const tokens = [...healthyTokens(), tok("kasi", "NOUN")];
    const res = checkRuleLayer(
      input({
        responseForms: ["negotiate"],
        responseTokens: tokens,
        tagalogLexicon: new Set(["kasi"]),
      }),
    );
    expect(res).toEqual({ ok: false, reason: "taglish" });
  });

  it("an all-English L1-interference sentence is NOT flagged (proceeds to the judge)", () => {
    // Omitted article ("she negotiated better contract") — no Tagalog token, so it passes RL-4.
    const res = checkRuleLayer(
      input({
        responseForms: ["negotiate"],
        responseTokens: healthyTokens(),
        tagalogLexicon: new Set(["kasi", "ang", "ng"]),
      }),
    );
    expect(res).toEqual({ ok: true });
  });
});
