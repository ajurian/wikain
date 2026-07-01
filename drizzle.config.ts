import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config (STACK-6). Generates SQL migrations from the single schema source
 * (src/infrastructure/db/schema.ts) into `drizzle/`. The same migrations are applied to pglite in
 * tests (via the pglite migrator) and to Neon in production — no hand-written DDL, no drift.
 */
export default defineConfig({
  schema: "./src/infrastructure/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
});
