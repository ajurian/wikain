import { describe, expect, it } from "vitest";
import { skipActiveBatchCard } from "./skipActiveBatchCard.js";
import { KIT_NOW, makeBatchStore, makeSessionStateStore } from "./sessionBatchTestKit.js";
import type { ActiveSessionState } from "../ports/sessionState.js";

const LATER = new Date(KIT_NOW.getTime() + 60_000);

function activeState(progressIndex = 0): ActiveSessionState {
  return {
    userId: "u1",
    batchId: "batch-x",
    batchNumber: 1,
    entries: [
      { senseId: "a", tier: "free" },
      { senseId: "b", tier: "cloze" },
    ],
    progressIndex,
    startedAt: KIT_NOW,
    lastInteractionAt: KIT_NOW,
  };
}

async function setup(progressIndex = 0) {
  const sessionState = makeSessionStateStore();
  const batches = makeBatchStore();
  await sessionState.save(activeState(progressIndex));
  return { sessionState, batches };
}

describe("skipActiveBatchCard", () => {
  it("BAT-8: a terminal skip removes the current card — the denominator shrinks, no tick", async () => {
    const deps = await setup();
    const res = await skipActiveBatchCard({ userId: "u1", senseId: "a", now: LATER }, deps);
    expect(res).toEqual({
      active: true,
      progress: { completed: 0, total: 1, atSeam: false },
    });
    const state = deps.sessionState.peek("u1")!;
    expect(state.entries.map((e) => e.senseId)).toEqual(["b"]);
    expect(state.lastInteractionAt).toEqual(LATER);
  });

  it("BAT-8: a shrink that reaches N finalizes the batch as completed", async () => {
    const deps = await setup(1); // one rating logged, the last card is skipped
    const res = await skipActiveBatchCard({ userId: "u1", senseId: "b", now: LATER }, deps);
    if (!res.active) throw new Error("expected an active batch");
    expect(res.progress).toEqual({ completed: 1, total: 1, atSeam: true });
    expect(deps.batches.finalized).toHaveLength(1);
    expect(deps.batches.finalized[0]!.f.outcome).toBe("completed");
    expect(deps.batches.finalized[0]!.f.completedCount).toBe(1);
  });

  it("defensive: a skip for a non-current card changes nothing but the interaction stamp", async () => {
    const deps = await setup();
    const res = await skipActiveBatchCard({ userId: "u1", senseId: "b", now: LATER }, deps);
    if (!res.active) throw new Error("expected an active batch");
    expect(res.progress.total).toBe(2);
    expect(deps.sessionState.peek("u1")!.entries).toHaveLength(2);
  });

  it("no active batch → inactive no-op", async () => {
    const deps = { sessionState: makeSessionStateStore(), batches: makeBatchStore() };
    const res = await skipActiveBatchCard({ userId: "u1", senseId: "a", now: LATER }, deps);
    expect(res).toEqual({ active: false });
  });
});
