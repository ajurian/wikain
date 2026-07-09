/**
 * The Drizzle settings adapter runs the SHARED port contract (spec/10 CNT-8) against a real, migrated
 * pglite database — proving the upsert-merge survives a genuine SQL round-trip. Fully offline.
 */
import { describeSettingsContract } from "./settingsContract.js";
import { DrizzleSettings } from "./drizzleSettings.js";
import { makePgliteDb } from "../db/pglite.js";

describeSettingsContract(
  "DrizzleSettings (pglite)",
  async () => new DrizzleSettings(await makePgliteDb()),
);
