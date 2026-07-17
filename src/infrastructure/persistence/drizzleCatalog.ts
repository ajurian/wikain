/**
 * Drizzle-backed Catalog (spec/12-data-model.md DM-2, STACK-3/6). The catalog is global, immutable,
 * read-only content, so this adapter HYDRATES it once — `hydrate(db)` runs a single `SELECT *` and holds
 * the items in an in-memory Map — and thereafter `get()` is a synchronous lookup. That keeps the `Catalog`
 * port synchronous, so the NET-2 instant rule-layer bounce (`checkFreeProductionRuleLayer`) and prompt
 * rendering stay local (no per-lookup round trip), while the store of record is Postgres (no filesystem
 * read on the serverless request path). The whole catalog is small and shared across users; caching it per
 * instance is correct, not wasteful. All Drizzle/SQL stays confined here + `db/schema.ts` (ARCH-1).
 */
import type { Catalog } from "~/application/ports/catalog.js";
import type { LexicalItem } from "~/domain/lexicalItem.js";
import type { DrizzleDb } from "./drizzleCardRepository.js";
import { lexicalItems } from "../db/schema.js";
import { fromLexicalRow } from "../db/lexicalItemMapping.js";

export class DrizzleCatalog implements Catalog {
  private constructor(private readonly items: Map<string, LexicalItem>) {}

  /** Load the whole catalog into memory once (per instance). Async construction; sync reads thereafter. */
  static async hydrate(db: DrizzleDb): Promise<DrizzleCatalog> {
    const rows = await db.select().from(lexicalItems);
    return new DrizzleCatalog(
      new Map(rows.map((r) => [r.senseId, fromLexicalRow(r)])),
    );
  }

  get(senseId: string): LexicalItem | undefined {
    return this.items.get(senseId);
  }
}
