import { afterEach } from "vitest";
import { closeAllPglite } from "./src/infrastructure/db/pglite.js";

/**
 * Free every pglite WASM heap after each test. pglite memory lives off the V8 heap, so an
 * un-`close()`d instance per `it` accumulates until the process dies (`Fatal … out of memory: Zone`).
 * Closing here keeps the Drizzle-only test strategy (real Postgres semantics, no in-memory adapters)
 * from blowing the process budget.
 */
afterEach(async () => {
  await closeAllPglite();
});
