import { describe, expect, it } from "vitest";
import { LEXTALE_ITEMS, LEXTALE_PRACTICE_ITEMS, scoreLexTale } from "./lextale.js";

/** Answer every item with the same yes/no, to probe the yes-bias correction. */
function answerAll(value: boolean): Map<string, boolean> {
  return new Map(LEXTALE_ITEMS.map((i) => [i.item, value]));
}

/** The perfect run: "yes" to every word, "no" to every nonword. */
function answerPerfectly(): Map<string, boolean> {
  return new Map(LEXTALE_ITEMS.map((i) => [i.item, i.isWord]));
}

describe("the published LexTALE instrument (SEED-4)", () => {
  it("SEED-4: carries exactly the published 60 items — 40 words, 20 nonwords", () => {
    expect(LEXTALE_ITEMS).toHaveLength(60);
    expect(LEXTALE_ITEMS.filter((i) => i.isWord)).toHaveLength(40);
    expect(LEXTALE_ITEMS.filter((i) => !i.isWord)).toHaveLength(20);
  });

  it("SEED-4: every item is unique (a duplicate would silently reweight the score)", () => {
    const seen = new Set(LEXTALE_ITEMS.map((i) => i.item));
    expect(seen.size).toBe(LEXTALE_ITEMS.length);
  });

  it("SEED-4: the three published practice items lead, and are NOT scored", () => {
    expect(LEXTALE_PRACTICE_ITEMS.map((i) => i.item)).toEqual(["platery", "denial", "generic"]);
    const scored = new Set(LEXTALE_ITEMS.map((i) => i.item));
    for (const p of LEXTALE_PRACTICE_ITEMS) expect(scored.has(p.item)).toBe(false);
  });
});

describe("scoreLexTale (SEED-4)", () => {
  it("SEED-4: a perfect run scores 100", () => {
    expect(scoreLexTale(answerPerfectly())).toBe(100);
  });

  it("SEED-4: answering yes to everything scores 50 — the averaged formula neutralizes yes-bias", () => {
    // 40/40 words correct (100%) but 0/20 nonwords correct (0%) → (100 + 0) / 2.
    expect(scoreLexTale(answerAll(true))).toBe(50);
  });

  it("SEED-4: answering no to everything scores 50 — the mirror of the yes-bias case", () => {
    expect(scoreLexTale(answerAll(false))).toBe(50);
  });

  it("SEED-4: words and nonwords are weighted equally despite the 40/20 split", () => {
    // Miss ONE nonword (1/20 = 5 percentage points of that half → 2.5 averaged); miss ONE word
    // (1/40 = 2.5 points of that half → 1.25 averaged). The rarer item type must count for more.
    const missNonword = answerPerfectly();
    missNonword.set("kermshaw", true); // a nonword called a word
    const missWord = answerPerfectly();
    missWord.set("scornful", false); // a word called a nonword

    expect(scoreLexTale(missNonword)).toBeCloseTo(97.5, 10);
    expect(scoreLexTale(missWord)).toBeCloseTo(98.75, 10);
  });

  it("SEED-4: throws on a missing answer rather than scoring a partial run (halt, don't guess)", () => {
    const partial = answerPerfectly();
    partial.delete("wrought");
    expect(() => scoreLexTale(partial)).toThrow(/wrought/);
  });

  it("SEED-4: throws on an answer for an item outside the published instrument", () => {
    const extra = answerPerfectly();
    extra.set("bogusword", true);
    expect(() => scoreLexTale(extra)).toThrow(/bogusword/);
  });
});
