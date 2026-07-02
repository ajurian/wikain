/**
 * WordSource adapter (SEED-2/5): the frequency-ordered list stack over the built catalog
 * (build/out/items.json). Selection only — it never creates cards or marks words known (SEED-3).
 * Ordered by `list_rank` ascending (the list-stack frequency order), with null ranks last, then by
 * `sense_id` as a deterministic tiebreak (most items carry no list_rank yet — DM-2).
 */
import fs from "node:fs";
import type { WordSource } from "../application/ports/wordSource.js";
import type { LexicalItem } from "../domain/lexicalItem.js";

const RANK_LAST = Number.POSITIVE_INFINITY;

export class JsonWordSource implements WordSource {
  /** Frontier band → items in that band, pre-sorted in list-stack order. */
  private readonly byBand: Map<string, LexicalItem[]>;

  constructor(items: readonly LexicalItem[]) {
    const sorted = [...items].sort((a, b) => {
      const ra = a.list_rank ?? RANK_LAST;
      const rb = b.list_rank ?? RANK_LAST;
      return ra !== rb ? ra - rb : a.sense_id.localeCompare(b.sense_id);
    });
    this.byBand = new Map();
    for (const it of sorted) {
      const bucket = this.byBand.get(it.band);
      if (bucket) bucket.push(it);
      else this.byBand.set(it.band, [it]);
    }
  }

  static fromFile(path: string): JsonWordSource {
    const raw = JSON.parse(fs.readFileSync(path, "utf8")) as LexicalItem[];
    return new JsonWordSource(raw);
  }

  async nextFrontierWords(
    band: string,
    exclude: ReadonlySet<string>,
    count: number,
  ): Promise<string[]> {
    if (count <= 0) return [];
    const bucket = this.byBand.get(band) ?? [];
    const picks: string[] = [];
    for (const it of bucket) {
      if (exclude.has(it.sense_id)) continue;
      picks.push(it.sense_id);
      if (picks.length === count) break;
    }
    return picks;
  }
}
