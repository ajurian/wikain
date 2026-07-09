/**
 * Shared VerdictMemoPort conformance suite (spec/05-verdict-memo.md MEMO-1..6). Every implementation
 * MUST pass identically — the executable statement of Liskov substitutability (SOLID-3): the in-memory
 * and Drizzle adapters run through the SAME assertions, so a divergence fails the build. Not a
 * `*.test.ts` itself; imported by each adapter's test file.
 */
import { describe, expect, it } from "vitest";
import type { MemoVersions, VerdictMemoPort } from "../application/ports/verdictMemo.js";
import type { JudgeVerdict } from "../domain/review/verdict.js";
import { USER_A, USER_B } from "./testIds.js";

const V1: MemoVersions = { modelVersion: "m1", rubricVersion: "r1" };

function verdict(overrides: Partial<JudgeVerdict> = {}): JudgeVerdict {
  return {
    used_in_target_sense: true,
    detected_sense: "to give up completely",
    intended_sense: "to give up completely",
    grammatical: true,
    collocation_natural: true,
    register_fit: "ok",
    replacements: [],
    corrected_sentence: "She abandoned the plan.",
    enrichment_suggestion: null,
    one_line_feedback: "Great use of 'abandon'.",
    ...overrides,
  };
}

/**
 * Runs the full port contract against a freshly-isolated memo produced by `makeMemo` (a new, empty
 * store per call so tests never share state).
 */
export function describeVerdictMemoContract(
  label: string,
  makeMemo: () => Promise<VerdictMemoPort>,
): void {
  describe(`VerdictMemoPort contract — ${label}`, () => {
    it("MEMO-1: a recorded verdict is returned on a matching lookup (a hit)", async () => {
      const memo = await makeMemo();
      const v = verdict();
      await memo.record(USER_A, "key-1", v, V1);

      const hit = await memo.lookup(USER_A, "key-1", V1);
      expect(hit).toEqual(v);
    });

    it("MEMO-1: an unrecorded key is a miss", async () => {
      const memo = await makeMemo();
      expect(await memo.lookup(USER_A, "never-recorded", V1)).toBeUndefined();
    });

    it("MEMO-2: a different key (e.g. a different sense) is a miss", async () => {
      const memo = await makeMemo();
      // Opaque keys to the port — the domain builds them; here two distinct keys prove key-scoping.
      await memo.record(USER_A, "key-sense-01", verdict(), V1);
      const miss = await memo.lookup(USER_A, "key-sense-02", V1);
      expect(miss).toBeUndefined();
    });

    it("MEMO-5: user B never sees user A's verdict", async () => {
      const memo = await makeMemo();
      await memo.record(USER_A, "key-1", verdict(), V1);
      expect(await memo.lookup(USER_B, "key-1", V1)).toBeUndefined();
    });

    it("MEMO-6: a stale version pair is a miss", async () => {
      const memo = await makeMemo();
      await memo.record(USER_A, "key-1", verdict(), V1);
      const stale = await memo.lookup(USER_A, "key-1", { modelVersion: "m2", rubricVersion: "r1" });
      expect(stale).toBeUndefined();
    });

    it("MEMO-6: re-recording under a bumped version overwrites the stale row", async () => {
      const memo = await makeMemo();
      await memo.record(USER_A, "key-1", verdict({ one_line_feedback: "old" }), V1);
      const V2: MemoVersions = { modelVersion: "m2", rubricVersion: "r1" };
      await memo.record(USER_A, "key-1", verdict({ one_line_feedback: "new" }), V2);

      // The old version is now gone (a miss); the new version hits with the fresh verdict.
      expect(await memo.lookup(USER_A, "key-1", V1)).toBeUndefined();
      expect((await memo.lookup(USER_A, "key-1", V2))?.one_line_feedback).toBe("new");
    });
  });
}
