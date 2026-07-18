/**
 * Shared SessionStateStore conformance suite (spec/14 BAT-11/12/13). The sole implementation is
 * `DrizzleSessionState` over pglite; the suite stays a shared contract so a second adapter would be
 * held to the same behavior (SOLID-3). Not a `*.test.ts` itself.
 */
import { describe, expect, it } from "vitest";
import type {
  ActiveSessionState,
  SessionStateStore,
} from "~/application/ports/sessionState.js";
import { USER_A, USER_B } from "../testIds.js";

const BATCH_ID_1 = "5f2b6a1c-9d3e-4f70-8a21-000000000001";
const BATCH_ID_2 = "5f2b6a1c-9d3e-4f70-8a21-000000000002";

function state(overrides: Partial<ActiveSessionState> = {}): ActiveSessionState {
  return {
    userId: USER_A,
    batchId: BATCH_ID_1,
    batchNumber: 1,
    entries: [
      { senseId: "owe_verb_01", tier: "cloze" },
      { senseId: "abandon_verb_01", tier: "free" },
    ],
    progressIndex: 0,
    startedAt: new Date("2026-07-17T10:00:00.000Z"),
    lastInteractionAt: new Date("2026-07-17T10:05:00.000Z"),
    ...overrides,
  };
}

export function describeSessionStateContract(
  label: string,
  makeStore: () => Promise<SessionStateStore>,
): void {
  describe(`SessionStateStore contract — ${label}`, () => {
    it("BAT-11: an absent row loads as undefined (no active session)", async () => {
      const store = await makeStore();
      expect(await store.load(USER_A)).toBeUndefined();
    });

    it("BAT-11: the full state round-trips — entries jsonb and Dates included", async () => {
      const store = await makeStore();
      const s = state();
      await store.save(s);
      expect(await store.load(USER_A)).toEqual(s);
    });

    it("BAT-13: save replaces the whole row (a rebuilt batch leaves nothing of the old one)", async () => {
      const store = await makeStore();
      await store.save(state({ progressIndex: 2 }));
      const rebuilt = state({
        batchId: BATCH_ID_2,
        batchNumber: 1,
        entries: [{ senseId: "negotiate_verb_01", tier: "recognition" }],
        progressIndex: 0,
        startedAt: new Date("2026-07-17T11:00:00.000Z"),
        lastInteractionAt: new Date("2026-07-17T11:00:00.000Z"),
      });
      await store.save(rebuilt);
      expect(await store.load(USER_A)).toEqual(rebuilt);
    });

    it("BAT-9: clear removes the active session; a re-load is undefined", async () => {
      const store = await makeStore();
      await store.save(state());
      await store.clear(USER_A);
      expect(await store.load(USER_A)).toBeUndefined();
    });

    it("multi-tenant: user B never sees user A's session", async () => {
      const store = await makeStore();
      await store.save(state());
      expect(await store.load(USER_B)).toBeUndefined();
    });
  });
}
