import { describe, expect, it } from "vitest";
import type { ClozeFitEntry } from "../lexicalItem.js";
import type { NlpToken } from "./ruleLayer.js";
import { damerauLevenshtein, healCandidateLemma, resolveClozeLane } from "./clozeFitSet.js";

/** The owe/pay/lend fixture from AMMENDMENT §A1.2. */
const FIT_SET: ClozeFitEntry[] = [
  { lemma: "owe", class: "target" },
  { lemma: "pay", class: "same_sense_near_miss" },
  { lemma: "repay", class: "same_sense_near_miss" },
  { lemma: "lend", class: "different_sense_fit" },
  { lemma: "give", class: "different_sense_fit" },
];

function lane(responseForms: string[], responseRaw: string, fitSet: ClozeFitEntry[] | null = FIT_SET) {
  return resolveClozeLane({ responseForms, responseRaw, targetLemma: "owe", fitSet });
}

describe("FIT-6 lane resolution (dictionary lookup, fixed precedence)", () => {
  it("resolves the target lane on an inflected form of the target (TIER-5 lemma match)", () => {
    expect(lane(["owed", "owe"], "owed")).toEqual({ kind: "target" });
  });

  it("resolves same_sense_near_miss via the typed word's lemma", () => {
    expect(lane(["paid", "pay"], "paid")).toEqual({
      kind: "soft",
      lane: "same_sense_near_miss",
    });
  });

  it("resolves different_sense_fit as its own lane, never a near-miss", () => {
    expect(lane(["lend", "lend"], "lend")).toEqual({
      kind: "soft",
      lane: "different_sense_fit",
    });
  });

  it("fit-set membership beats typo distance (a listed word one edit away is its own word)", () => {
    const fitSet: ClozeFitEntry[] = [
      { lemma: "owe", class: "target" },
      { lemma: "own", class: "different_sense_fit" },
    ];
    expect(lane(["own", "own"], "own", fitSet)).toEqual({
      kind: "soft",
      lane: "different_sense_fit",
    });
  });

  it("FIT-9: an unlisted word within DL 1 of the target takes the typo lane", () => {
    expect(lane(["owwe", "owwe"], "owwe")).toEqual({ kind: "typo" });
  });

  it("an unlisted word beyond the typo distance takes the wrong path", () => {
    expect(lane(["settle", "settle"], "settle")).toEqual({ kind: "wrong" });
  });

  it("matches case-insensitively", () => {
    expect(lane(["Paid", "Pay"], "Paid")).toEqual({ kind: "soft", lane: "same_sense_near_miss" });
  });

  it("degrades to target/typo/wrong when the item has no fit set (pre-fit-set catalog rows)", () => {
    expect(lane(["owed", "owe"], "owed", null)).toEqual({ kind: "target" });
    expect(lane(["owwe", "owwe"], "owwe", null)).toEqual({ kind: "typo" });
    expect(lane(["pay", "pay"], "pay", null)).toEqual({ kind: "wrong" });
  });
});

describe("FIT-9 Damerau–Levenshtein (restricted / optimal string alignment)", () => {
  it("counts substitutions, insertions, deletions", () => {
    expect(damerauLevenshtein("owe", "owe")).toBe(0);
    expect(damerauLevenshtein("owe", "owa")).toBe(1);
    expect(damerauLevenshtein("owe", "owwe")).toBe(1);
    expect(damerauLevenshtein("owe", "ow")).toBe(1);
  });

  it("counts a transposition as one edit (the Damerau part)", () => {
    expect(damerauLevenshtein("owe", "oew")).toBe(1);
  });

  it("distances a genuinely different word beyond the threshold", () => {
    expect(damerauLevenshtein("owe", "lend")).toBeGreaterThan(1);
  });
});

describe("FIT-11 heal-candidate detection (single plausible word)", () => {
  const token = (overrides: Partial<NlpToken>): NlpToken => ({
    normal: "settle",
    lemma: "settle",
    pos: "VERB",
    isStopword: false,
    isWord: true,
    ...overrides,
  });

  it("returns the lemma for a single alphabetic word token", () => {
    expect(healCandidateLemma([token({})])).toBe("settle");
  });

  it("rejects multi-word responses (the cloze asks for one word)", () => {
    expect(healCandidateLemma([token({}), token({ normal: "up", lemma: "up" })])).toBeNull();
  });

  it("ignores punctuation tokens around the word", () => {
    const period = token({ normal: ".", lemma: ".", isWord: false });
    expect(healCandidateLemma([token({}), period])).toBe("settle");
  });

  it("rejects non-alphabetic tokens (garbage is not a heal candidate)", () => {
    expect(healCandidateLemma([token({ normal: "1234", lemma: "1234" })])).toBeNull();
    expect(healCandidateLemma([])).toBeNull();
  });
});
