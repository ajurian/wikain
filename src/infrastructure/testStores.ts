/**
 * A full set of pglite-backed Drizzle stores sharing ONE migrated in-memory database — the test
 * substitute for the (removed) in-memory adapters. Real Postgres semantics, fully offline. Not
 * production code; imported only by `*.smoke.test.ts` / use-case tests that need a shared store.
 *
 * The global catalog is now DB-backed too (slice 21): each test DB is seeded from `build/out/items.json`
 * (the same build output prod seeds via `db:seed:catalog`), and `catalog`/`wordSource` are the real
 * Drizzle adapters over that data — so smoke tests exercise the exact production read path, not a
 * filesystem shim. `ITEMS_PATH` + the parsed `items` are exposed so a test can still pick a target word.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LexicalItem } from "../domain/lexicalItem.js";
import { DrizzleCardRepository } from "./drizzleCardRepository.js";
import { DrizzleVerdictMemo } from "./drizzleVerdictMemo.js";
import { DrizzlePlacementMarks } from "./drizzlePlacementMarks.js";
import { DrizzlePlacementProfile } from "./drizzlePlacementProfile.js";
import { DrizzleSettings } from "./drizzleSettings.js";
import { DrizzleCatalog } from "./drizzleCatalog.js";
import { DrizzleWordSource } from "./drizzleWordSource.js";
import { seedLexicalItems } from "./db/seedCatalog.js";
import { makePgliteDb } from "./db/pglite.js";

/** repo/build/out/items.json, resolved from src/infrastructure/ (test-only; the runtime reads the DB). */
export const ITEMS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "build",
  "out",
  "items.json",
);

/** The built catalog as an array (test convenience — pick a target word without re-reading the file). */
export function loadCatalogItems(): LexicalItem[] {
  return JSON.parse(fs.readFileSync(ITEMS_PATH, "utf8")) as LexicalItem[];
}

export async function makeTestStores() {
  const db = await makePgliteDb();
  const items = loadCatalogItems();
  await seedLexicalItems(db, items);
  return {
    db,
    items,
    cards: new DrizzleCardRepository(db),
    memo: new DrizzleVerdictMemo(db),
    marks: new DrizzlePlacementMarks(db),
    profile: new DrizzlePlacementProfile(db),
    settings: new DrizzleSettings(db),
    catalog: await DrizzleCatalog.hydrate(db),
    wordSource: new DrizzleWordSource(db),
  };
}
