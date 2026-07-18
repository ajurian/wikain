import { describe, expect, it } from "vitest";
import { advanceActiveBatch } from "./advanceActiveBatch.js";
import { KIT_NOW, makeBatchStore, makeSessionStateStore } from "./sessionBatchTestKit.js";
import type { ActiveSessionState } from "../ports/sessionState.js";

const LATER = new Date(KIT_NOW.getTime() + 60_000);

function activeState(progressIndex = 0): ActiveSessionState {
  return {
    userId: "u1",
    batchId: "batch-x",
    batchNumber: 1,
    entries: [
      { senseId: "a", tier: "recognition" },
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

describe("advanceActiveBatch", () => {
  it("BAT-7: a logged rating on the current card ticks the bar and stamps the interaction", async () => {
    const deps = await setup();
    const res = await advanceActiveBatch(
      { userId: "u1", senseId: "a", ratingLogged: true, now: LATER },
      deps,
    );
    expect(res).toEqual({
      active: true,
      progress: { completed: 1, total: 2, atSeam: false },
    });
    expect(deps.sessionState.peek("u1")!.progressIndex).toBe(1);
    expect(deps.sessionState.peek("u1")!.lastInteractionAt).toEqual(LATER);
  });

  it("BAT-7: a no-rating interaction (bounce/soft bounce/unavailable) stamps but never ticks", async () => {
    const deps = await setup();
    const res = await advanceActiveBatch(
      { userId: "u1", senseId: "a", ratingLogged: false, now: LATER },
      deps,
    );
    if (!res.active) throw new Error("expected an active batch");
    expect(res.progress.completed).toBe(0);
    expect(deps.sessionState.peek("u1")!.progressIndex).toBe(0);
    expect(deps.sessionState.peek("u1")!.lastInteractionAt).toEqual(LATER);
  });

  it("defensive: a rating for a card that is not the batch's current one only stamps", async () => {
    const deps = await setup();
    const res = await advanceActiveBatch(
      { userId: "u1", senseId: "b", ratingLogged: true, now: LATER },
      deps,
    );
    if (!res.active) throw new Error("expected an active batch");
    expect(res.progress.completed).toBe(0);
  });

  it("BAT-9/16: the tick that reaches N/N finalizes the batch as completed and reports the seam", async () => {
    const deps = await setup(1);
    const res = await advanceActiveBatch(
      { userId: "u1", senseId: "b", ratingLogged: true, now: LATER },
      deps,
    );
    expect(res).toEqual({
      active: true,
      progress: { completed: 2, total: 2, atSeam: true },
    });
    expect(deps.batches.finalized).toHaveLength(1);
    const { f } = deps.batches.finalized[0]!;
    expect(f.outcome).toBe("completed");
    expect(f.completedCount).toBe(2);
    expect(f.wallClockMs).toBe(60_000);
  });

  it("BAT-1: no active batch → inactive no-op (a rating is never blocked by presentation state)", async () => {
    const deps = { sessionState: makeSessionStateStore(), batches: makeBatchStore() };
    const res = await advanceActiveBatch(
      { userId: "u1", senseId: "a", ratingLogged: true, now: LATER },
      deps,
    );
    expect(res).toEqual({ active: false });
  });
});
