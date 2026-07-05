/**
 * The in-memory placement-marks store runs the shared port contract (spec/09 SEED-2/7) — the same
 * suite the Drizzle adapter runs, proving both are substitutable (SOLID-3).
 */
import { describePlacementMarksContract } from "./placementMarksContract.js";
import { InMemoryPlacementMarks } from "./inMemoryPlacementMarks.js";

describePlacementMarksContract("InMemoryPlacementMarks", async () => new InMemoryPlacementMarks());
