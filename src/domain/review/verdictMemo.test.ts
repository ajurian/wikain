import { describe, it, expect } from "vitest";
import { memoKey, normalizeSentence } from "./verdictMemo.js";

describe("normalizeSentence (MEMO-3)", () => {
  it("MEMO-3: lowercases, trims, and collapses internal whitespace", () => {
    expect(normalizeSentence("  The   Cat   sat  ")).toBe("the cat sat");
  });

  it("MEMO-3: strips outer punctuation but preserves inner punctuation", () => {
    expect(normalizeSentence("Well, it works.")).toBe("well, it works");
  });

  it("MEMO-3: a trailing ? and a trailing . normalize identically", () => {
    expect(normalizeSentence("Is it done?")).toBe(normalizeSentence("Is it done."));
  });
});

describe("memoKey (MEMO-2/MEMO-4)", () => {
  const norm = normalizeSentence("She abandoned the plan.");

  it("MEMO-2: same normalized text but a different sense yields a different key", () => {
    const a = memoKey({ normalizedSentence: norm, lemma: "abandon", senseId: "abandon_verb_01" });
    const b = memoKey({ normalizedSentence: norm, lemma: "abandon", senseId: "abandon_verb_02" });
    expect(a).not.toBe(b);
  });

  it("MEMO-2: same normalized text but a different lemma yields a different key", () => {
    const a = memoKey({ normalizedSentence: norm, lemma: "abandon", senseId: "s1" });
    const b = memoKey({ normalizedSentence: norm, lemma: "desert", senseId: "s1" });
    expect(a).not.toBe(b);
  });

  it("MEMO-4: a near-but-not-identical sentence yields a different key", () => {
    const near = normalizeSentence("She abandoned the plans.");
    const a = memoKey({ normalizedSentence: norm, lemma: "abandon", senseId: "s1" });
    const b = memoKey({ normalizedSentence: near, lemma: "abandon", senseId: "s1" });
    expect(a).not.toBe(b);
  });

  it("MEMO-2/MEMO-4: identical fields yield an identical key (a hit)", () => {
    const a = memoKey({ normalizedSentence: norm, lemma: "abandon", senseId: "s1" });
    const b = memoKey({ normalizedSentence: norm, lemma: "abandon", senseId: "s1" });
    expect(a).toBe(b);
  });
});
