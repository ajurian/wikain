/**
 * A full set of pglite-backed Drizzle stores sharing ONE migrated in-memory database — the test
 * substitute for the (removed) in-memory adapters. Real Postgres semantics, fully offline. Not
 * production code; imported only by `*.smoke.test.ts` / use-case tests that need a shared store.
 */
import { DrizzleCardRepository } from "./drizzleCardRepository.js";
import { DrizzleVerdictMemo } from "./drizzleVerdictMemo.js";
import { DrizzlePlacementMarks } from "./drizzlePlacementMarks.js";
import { DrizzleSettings } from "./drizzleSettings.js";
import { makePgliteDb } from "./db/pglite.js";

export async function makeTestStores() {
  const db = await makePgliteDb();
  return {
    db,
    cards: new DrizzleCardRepository(db),
    memo: new DrizzleVerdictMemo(db),
    marks: new DrizzlePlacementMarks(db),
    settings: new DrizzleSettings(db),
  };
}
