import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

const isProd = process.env.NODE_ENV === "production";

config({
  path: isProd ? ".env.production" : ".env.development",
});

/**
 * drizzle-kit config (STACK-6). Generates SQL migrations from the single schema source
 * (src/infrastructure/db/schema.ts) into `drizzle/`. The same migrations are applied to pglite in
 * tests (via the pglite migrator) and to Neon in production — no hand-written DDL, no drift.
 */
export default defineConfig({
  schema: "./src/infrastructure/db/schema.ts",
  out: isProd ? "./drizzle/production" : "./drizzle/development",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
