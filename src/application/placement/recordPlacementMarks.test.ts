import { describe, it, expect } from "vitest";
import { recordPlacementMarks } from "./recordPlacementMarks.js";
import { DrizzlePlacementMarks } from "../../infrastructure/persistence/drizzlePlacementMarks.js";
import { makePgliteDb } from "../../infrastructure/db/pglite.js";
import { USER_A, USER_B } from "../../infrastructure/testIds.js";

describe("recordPlacementMarks", () => {
  it("SEED-2: forwards the learner's marks to the store, scoped by user", async () => {
    const marks = new DrizzlePlacementMarks(await makePgliteDb());
    await recordPlacementMarks({ userId: USER_A, senseIds: ["s1", "s2"] }, { marks });
    expect((await marks.list(USER_A)).sort()).toEqual(["s1", "s2"]);
    expect(await marks.list(USER_B)).toEqual([]);
  });
});
