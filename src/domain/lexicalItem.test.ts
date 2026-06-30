import { describe, it, expect } from "vitest";
import type { LexicalItem as RuntimeItem } from "./lexicalItem.js";
import type { LexicalItem as BuildItem } from "../../build/types.js";

/**
 * DM-12 / DM-4 [FLAG]: producer (build) ↔ consumer (runtime) schema conformance is a typed
 * assertion. If the build output schema drifts from this consumption contract, this file stops
 * type-checking — surfacing the drift instead of silently adapting one side.
 */
describe("DM-2 lexical-item consumption contract", () => {
  it("accepts a build-produced item as a runtime item (no schema drift)", () => {
    const built = {} as BuildItem;
    const consumed: RuntimeItem = built; // build ⊆ runtime — fails to compile on drift
    expect(consumed).toBe(built);
  });
});
