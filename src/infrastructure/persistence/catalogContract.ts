/**
 * Shared Catalog conformance suite (spec/12-data-model.md DM-2/DM-4). Every implementation MUST pass
 * identically (SOLID-3). Asserts a seeded item round-trips every field unchanged (DM-2 read-only), a
 * `model_sentence: null` item is tolerated (DM-4), and an unknown sense_id resolves undefined. Not a
 * `*.test.ts` itself — `drizzleCatalog.test.ts` runs it over pglite.
 */
import { describe, expect, it } from "vitest";
import type { Catalog } from "~/application/ports/catalog.js";
import type { LexicalItem } from "~/domain/lexicalItem.js";
import { makeLexicalItem } from "../testLexicalItems.js";

export function describeCatalogContract(
  label: string,
  makeCatalog: (items: readonly LexicalItem[]) => Promise<Catalog>,
): void {
  describe(`Catalog contract — ${label}`, () => {
    it("DM-2: a seeded item round-trips every carried/generated/provenance field unchanged", async () => {
      const item = makeLexicalItem({ sense_id: "abandon_verb_01", word: "abandon", lemma: "abandon" });
      const catalog = await makeCatalog([item]);
      expect(catalog.get("abandon_verb_01")).toEqual(item);
    });

    it("DM-4: a model_sentence: null item is stored and read back as null (not lost)", async () => {
      const item = makeLexicalItem({ sense_id: "esthetic_adj_01", model_sentence: null });
      const catalog = await makeCatalog([item]);
      expect(catalog.get("esthetic_adj_01")?.model_sentence).toBeNull();
    });

    it("DM-2: an unknown sense_id resolves undefined", async () => {
      const catalog = await makeCatalog([makeLexicalItem({ sense_id: "known_noun_01" })]);
      expect(catalog.get("missing_noun_01")).toBeUndefined();
    });
  });
}
