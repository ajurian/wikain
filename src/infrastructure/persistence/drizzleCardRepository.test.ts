/**
 * The Drizzle adapter runs the SHARED port contract (spec/12 DM-5..DM-7) against a real, migrated
 * pglite database — proving it is substitutable for the in-memory repo (SOLID-3) and that Dates +
 * mastery survive a genuine SQL round-trip. Fully offline (embedded Postgres, no Neon/network).
 */
import { describeCardRepositoryContract } from "./cardRepositoryContract.js";
import { DrizzleCardRepository } from "./drizzleCardRepository.js";
import { makePgliteDb } from "../db/pglite.js";

describeCardRepositoryContract(
  "DrizzleCardRepository (pglite)",
  async () => new DrizzleCardRepository(await makePgliteDb()),
);
