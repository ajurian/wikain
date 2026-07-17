/**
 * Seed the global `lexical_items` catalog (spec/12-data-model.md DM-2) from the build output
 * (`build/out/items.json`) into Postgres. This is the ONE place the manual generation pipeline's output
 * crosses into the runtime store — a **deploy-time** step (`npm run db:seed:catalog`, after
 * `db:migrate`), NOT a request-time read. It is the only surviving filesystem read tied to the catalog;
 * the serverless request path reads the catalog from the DB, never from disk.
 *
 * `seedLexicalItems` is the reusable, transactional core (also used by the test harness over pglite):
 * it fully REPLACES the catalog (delete-all + chunked insert) so a re-seed is idempotent and drops any
 * item removed from the build. The chunking keeps each INSERT under Postgres' bind-parameter ceiling.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { LexicalItem } from "~/domain/lexicalItem.js";
import type { DrizzleDb } from "../persistence/drizzleCardRepository.js";
import { lexicalItems } from "./schema.js";
import { toLexicalRow } from "./lexicalItemMapping.js";
import { dbFromEnv } from "./postgres.js";
import { config } from "dotenv";

config({
  path: path.resolve(
    process.cwd(),
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development",
  ),
});

/** ~16 cols/row; 500 rows ≈ 8k binds, comfortably under Postgres' 65535 limit. */
const INSERT_CHUNK = 500;

/** Replace the entire catalog with `items`. Transactional: on failure the old catalog is untouched. */
export async function seedLexicalItems(
  db: DrizzleDb,
  items: readonly LexicalItem[],
): Promise<number> {
  const rows = items.map(toLexicalRow);
  await db.transaction(async (tx) => {
    await tx.delete(lexicalItems);
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      await tx.insert(lexicalItems).values(rows.slice(i, i + INSERT_CHUNK));
    }
  });
  return rows.length;
}

/** repo/build/out/items.json, resolved from src/infrastructure/db/. */
function itemsPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "..", "build", "out", "items.json");
}

async function main(): Promise<void> {
  const raw = fs.readFileSync(itemsPath(), "utf8");
  const items = JSON.parse(raw) as LexicalItem[];
  if (items.length === 0) {
    throw new Error(
      "seedCatalog: build/out/items.json is empty ([]). Regenerate the catalog (feed → generate → " +
        "ingest → combine) before seeding.",
    );
  }
  const db = dbFromEnv();
  const n = await seedLexicalItems(db, items);
  console.log(
    `seedCatalog: replaced lexical_items with ${n} items from build/out/items.json`,
  );
}

// Run only when invoked directly (`tsx src/infrastructure/db/seedCatalog.ts`), not when imported.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
