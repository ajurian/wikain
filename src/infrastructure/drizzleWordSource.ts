/**
 * Drizzle-backed WordSource (spec/09 SEED-2/5, STACK-3/6): the frequency-ordered frontier selector,
 * over the global `lexical_items` catalog. Selection only — it never creates cards or marks words known
 * (SEED-3). The frontier `band` is a CEFR level (DM-2/DM-3); order is `zipf_rank` ascending (1 = most
 * frequent), `sense_id` as a deterministic tiebreak. The `ORDER BY … LIMIT` runs in SQL so we fetch N
 * rows, not the whole band. All Drizzle/SQL stays confined here + `db/schema.ts` (ARCH-1).
 */
import { and, asc, eq, notInArray } from "drizzle-orm";
import type { WordSource } from "../application/ports/wordSource.js";
import type { DrizzleDb } from "./drizzleCardRepository.js";
import { lexicalItems } from "./db/schema.js";

export class DrizzleWordSource implements WordSource {
  constructor(private readonly db: DrizzleDb) {}

  async nextFrontierWords(
    band: string,
    exclude: ReadonlySet<string>,
    count: number,
  ): Promise<string[]> {
    if (count <= 0) return [];
    const excluded = [...exclude];
    // `notInArray(col, [])` is a degenerate/always-false filter in SQL — omit it when nothing to exclude.
    const where =
      excluded.length === 0
        ? eq(lexicalItems.cefr, band)
        : and(eq(lexicalItems.cefr, band), notInArray(lexicalItems.senseId, excluded));

    const rows = await this.db
      .select({ senseId: lexicalItems.senseId })
      .from(lexicalItems)
      .where(where)
      .orderBy(asc(lexicalItems.zipfRank), asc(lexicalItems.senseId))
      .limit(count);

    return rows.map((r) => r.senseId);
  }
}
