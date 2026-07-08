/**
 * The Drizzle placement-profile adapter runs the SHARED port contract (spec/09 SEED-1/2/4) against a real,
 * migrated pglite database — proving the upsert-merge and the nullable `onboarded_at` Date survive a genuine
 * SQL round-trip. Fully offline.
 */
import { describePlacementProfileContract } from "./placementProfileContract.js";
import { DrizzlePlacementProfile } from "./drizzlePlacementProfile.js";
import { makePgliteDb } from "./db/pglite.js";

describePlacementProfileContract(
  "DrizzlePlacementProfile (pglite)",
  async () => new DrizzlePlacementProfile(await makePgliteDb()),
);
