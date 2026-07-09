/**
 * Shared PlacementMarksStore conformance suite (spec/09 SEED-2/7). Every implementation MUST pass
 * identically — the executable statement of Liskov substitutability (SOLID-3): the in-memory and
 * Drizzle adapters run through the SAME assertions, so a divergence fails the build. Not a `*.test.ts`
 * itself; imported by each adapter's test file.
 */
import { describe, expect, it } from "vitest";
import type { PlacementMarksStore } from "~/application/ports/placementMarks.js";
import { USER_A, USER_B } from "../testIds.js";

/**
 * Runs the full port contract against a freshly-isolated store produced by `makeStore` (a new, empty
 * store per call so tests never share state).
 */
export function describePlacementMarksContract(
  label: string,
  makeStore: () => Promise<PlacementMarksStore>,
): void {
  describe(`PlacementMarksStore contract — ${label}`, () => {
    it("SEED-2: recorded marks are returned by list", async () => {
      const store = await makeStore();
      await store.record(USER_A, ["s1", "s2"]);
      expect((await store.list(USER_A)).sort()).toEqual(["s1", "s2"]);
    });

    it("SEED-2: an unmarked user's list is empty", async () => {
      const store = await makeStore();
      expect(await store.list(USER_A)).toEqual([]);
    });

    it("SEED-2: record is idempotent — a re-marked word appears once", async () => {
      const store = await makeStore();
      await store.record(USER_A, ["s1"]);
      await store.record(USER_A, ["s1"]);
      expect(await store.list(USER_A)).toEqual(["s1"]);
    });

    it("SEED-2: separate record calls accumulate", async () => {
      const store = await makeStore();
      await store.record(USER_A, ["s1"]);
      await store.record(USER_A, ["s2", "s3"]);
      expect((await store.list(USER_A)).sort()).toEqual(["s1", "s2", "s3"]);
    });

    it("SEED-2: recording an empty set is a no-op (no rows, no crash)", async () => {
      const store = await makeStore();
      await store.record(USER_A, []);
      expect(await store.list(USER_A)).toEqual([]);
    });

    it("multi-tenant: user B never sees user A's marks", async () => {
      const store = await makeStore();
      await store.record(USER_A, ["s1"]);
      expect(await store.list(USER_B)).toEqual([]);
    });
  });
}
