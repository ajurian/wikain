/**
 * Catalog adapter: loads the build output (build/out/items.json) into memory as a read-only
 * lookup by `sense_id` (spec/12-data-model.md DM-2). The runtime never mutates the items.
 */
import fs from "node:fs";
import type { Catalog } from "../application/ports/catalog.js";
import type { LexicalItem } from "../domain/lexicalItem.js";

export class JsonCatalog implements Catalog {
  private readonly items: Map<string, LexicalItem>;

  constructor(items: readonly LexicalItem[]) {
    this.items = new Map(items.map((it) => [it.sense_id, it]));
  }

  static fromFile(path: string): JsonCatalog {
    const raw = JSON.parse(fs.readFileSync(path, "utf8")) as LexicalItem[];
    return new JsonCatalog(raw);
  }

  get(senseId: string): LexicalItem | undefined {
    return this.items.get(senseId);
  }
}
