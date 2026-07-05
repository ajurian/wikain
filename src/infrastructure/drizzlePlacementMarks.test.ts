/**
 * The Drizzle placement-marks adapter runs the SHARED port contract (spec/09 SEED-2/7) against a real,
 * migrated pglite database — proving it is substitutable for the in-memory store (SOLID-3) and that an
 * idempotent upsert survives a genuine SQL round-trip. Fully offline (embedded Postgres, no Neon).
 */
import { describePlacementMarksContract } from "./placementMarksContract.js";
import { DrizzlePlacementMarks } from "./drizzlePlacementMarks.js";
import { makePgliteDb } from "./db/pglite.js";

describePlacementMarksContract(
  "DrizzlePlacementMarks (pglite)",
  async () => new DrizzlePlacementMarks(await makePgliteDb()),
);
