/**
 * The Drizzle session-state adapter runs the SHARED port contract (spec/14 BAT-11) against a real,
 * migrated pglite database — proving the whole-row upsert and the jsonb `entries` round-trip
 * survive genuine SQL. Fully offline.
 */
import { describeSessionStateContract } from "./sessionStateContract.js";
import { DrizzleSessionState } from "./drizzleSessionState.js";
import { makePgliteDb } from "../db/pglite.js";

describeSessionStateContract(
  "DrizzleSessionState (pglite)",
  async () => new DrizzleSessionState(await makePgliteDb()),
);
