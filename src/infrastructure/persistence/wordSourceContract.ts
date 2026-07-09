/**
 * Shared WordSource conformance suite (spec/09 SEED-2/5). Every implementation MUST pass identically —
 * the executable statement of Liskov substitutability (SOLID-3). The store is built from a fixed set of
 * catalog items; the suite asserts frequency order, band scoping, exclusion, and exhaustion. Not a
 * `*.test.ts` itself — `drizzleWordSource.test.ts` runs it over pglite.
 */
import { describe, expect, it } from "vitest";
import type { WordSource } from "~/application/ports/wordSource.js";
import type { LexicalItem } from "~/domain/lexicalItem.js";
import { makeLexicalItem } from "../testLexicalItems.js";

/** `makeStore` seeds exactly `items` into a fresh backing store and returns a WordSource over it. */
export function describeWordSourceContract(
  label: string,
  makeStore: (items: readonly LexicalItem[]) => Promise<WordSource>,
): void {
  const item = (senseId: string, cefr: string, rank: number): LexicalItem =>
    makeLexicalItem({ sense_id: senseId, cefr: cefr as LexicalItem["cefr"], zipf_rank: rank });

  describe(`WordSource contract — ${label}`, () => {
    it("SEED-5: returns frontier words in zipf_rank ascending order (most frequent first)", async () => {
      const src = await makeStore([
        item("c_noun_01", "B2", 9000),
        item("a_noun_01", "B2", 120),
        item("b_noun_01", "B2", 1500),
      ]);
      expect(await src.nextFrontierWords("B2", new Set(), 3)).toEqual([
        "a_noun_01",
        "b_noun_01",
        "c_noun_01",
      ]);
    });

    it("SEED-5: only returns words in the requested band", async () => {
      const src = await makeStore([
        item("in_noun_01", "B2", 100),
        item("out_noun_01", "C1", 50),
      ]);
      expect(await src.nextFrontierWords("B2", new Set(), 10)).toEqual(["in_noun_01"]);
    });

    it("SEED-7: excludes words the user already has cards for", async () => {
      const src = await makeStore([
        item("a_noun_01", "B2", 100),
        item("b_noun_01", "B2", 200),
        item("c_noun_01", "B2", 300),
      ]);
      expect(await src.nextFrontierWords("B2", new Set(["b_noun_01"]), 10)).toEqual([
        "a_noun_01",
        "c_noun_01",
      ]);
    });

    it("SEED-5: returns fewer than count (down to zero) when the band is exhausted", async () => {
      const src = await makeStore([item("a_noun_01", "B2", 100)]);
      expect(await src.nextFrontierWords("B2", new Set(), 5)).toEqual(["a_noun_01"]);
      expect(await src.nextFrontierWords("A2", new Set(), 5)).toEqual([]);
    });

    it("SEED-5: a non-positive count selects nothing", async () => {
      const src = await makeStore([item("a_noun_01", "B2", 100)]);
      expect(await src.nextFrontierWords("B2", new Set(), 0)).toEqual([]);
    });
  });
}
