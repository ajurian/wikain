import { describe, it, expect } from "vitest";
import { recordPlacementMarks } from "./recordPlacementMarks.js";
import { InMemoryPlacementMarks } from "../infrastructure/inMemoryPlacementMarks.js";

describe("recordPlacementMarks", () => {
  it("SEED-2: forwards the learner's marks to the store, scoped by user", async () => {
    const marks = new InMemoryPlacementMarks();
    await recordPlacementMarks({ userId: "u1", senseIds: ["s1", "s2"] }, { marks });
    expect((await marks.list("u1")).sort()).toEqual(["s1", "s2"]);
    expect(await marks.list("u2")).toEqual([]);
  });
});
