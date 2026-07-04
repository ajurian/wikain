/**
 * The Drizzle memo adapter runs the SHARED port contract (spec/05 MEMO-1..6) against a real, migrated
 * pglite database — proving it is substitutable for the in-memory memo (SOLID-3) and that a verdict
 * survives a genuine jsonb round-trip. Fully offline (embedded Postgres, no Neon/network).
 */
import { describeVerdictMemoContract } from "./verdictMemoContract.js";
import { DrizzleVerdictMemo } from "./drizzleVerdictMemo.js";
import { makePgliteDb } from "./db/pglite.js";

describeVerdictMemoContract(
  "DrizzleVerdictMemo (pglite)",
  async () => new DrizzleVerdictMemo(await makePgliteDb()),
);
