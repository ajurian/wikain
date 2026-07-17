/**
 * Embedded in-process Postgres (pglite) factory. Used by the DB tests and any offline entry point so
 * the suite exercises REAL SQL (via the same Drizzle adapter as Neon) without a network or
 * credentials — mirroring how `liveJudge` keeps the DeepSeek network out of the default test wiring.
 *
 * The schema is applied from the generated migrations (`drizzle/development/`), the same ones Neon
 * runs, so there is no hand-written DDL and no drift between test and production shape.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema.js";

// `drizzle.config.ts` emits per-environment migration sets (`out: ./drizzle/{development,production}`);
// the suite runs the development set.
const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "drizzle",
  "development",
);

/**
 * Every live pglite client, so the test harness can free their WASM memory between tests. A pglite
 * instance holds a non-trivial WASM heap that V8's GC never reclaims (it is off-heap), so without an
 * explicit `close()` a suite that mints one DB per `it` exhausts the process (`Fatal … out of memory:
 * Zone`). `vitest.setup.ts` calls `closeAllPglite()` in an `afterEach`.
 */
const OPEN_CLIENTS = new Set<PGlite>();

/** A fresh, empty, fully-migrated in-memory Postgres database. Each call is fully isolated. */
export async function makePgliteDb(): Promise<PgliteDatabase<typeof schema>> {
  const client = new PGlite();
  OPEN_CLIENTS.add(client);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

/** Close and forget every pglite client made so far — releases their WASM heaps (test teardown only). */
export async function closeAllPglite(): Promise<void> {
  for (const client of OPEN_CLIENTS) {
    try {
      await client.close();
    } catch {
      // A client already closed/crashed is fine to ignore during teardown.
    }
  }
  OPEN_CLIENTS.clear();
}
