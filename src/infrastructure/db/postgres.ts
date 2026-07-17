/**
 * Neon (production) Drizzle handle. The connection string is read server-side from the environment
 * (`dbFromEnv`), mirroring how `deepSeekConfigFromEnv` is the single place a secret is read
 * (NET-7 / STACK-4) — never in application/domain/presentation. Kept out of the default test wirings
 * so the suite never needs a database or the network (the pglite factory backs tests instead).
 *
 * The generated migrations in `drizzle/` are applied to Neon out-of-band (`drizzle-kit migrate`),
 * not at process start.
 */
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import type { DrizzleDb } from "../persistence/drizzleCardRepository.js";
import * as schema from "./schema.js";

export function makeDb(connectionString: string): DrizzleDb {
  return process.env.NODE_ENV === "production"
    ? drizzleNeon(connectionString, { schema })
    : drizzlePg(connectionString, { schema });
}

export function dbFromEnv(): DrizzleDb {
  const url = process.env.DATABASE_URL;
  console.log(url);
  if (!url) throw new Error("DATABASE_URL is not set.");
  return makeDb(url);
}
