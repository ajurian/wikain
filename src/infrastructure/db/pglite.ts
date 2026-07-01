/**
 * Embedded in-process Postgres (pglite) factory. Used by the DB tests and any offline entry point so
 * the suite exercises REAL SQL (via the same Drizzle adapter as Neon) without a network or
 * credentials — mirroring how `liveJudge` keeps the DeepSeek network out of the default test wiring.
 *
 * The schema is applied from the generated migrations (`drizzle/`), the same ones Neon runs, so there
 * is no hand-written DDL and no drift between test and production shape.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema.js";

const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "drizzle",
);

/** A fresh, empty, fully-migrated in-memory Postgres database. Each call is fully isolated. */
export async function makePgliteDb(): Promise<PgliteDatabase<typeof schema>> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}
