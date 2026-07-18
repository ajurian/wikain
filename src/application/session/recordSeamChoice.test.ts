import { describe, expect, it } from "vitest";
import { recordSeamChoice } from "./recordSeamChoice.js";
import { getOrResumeSession } from "./getOrResumeSession.js";
import { advanceActiveBatch } from "./advanceActiveBatch.js";
import { card, KIT_NOW, makeBuildDeps } from "./sessionBatchTestKit.js";

const INPUT = { userId: "u1", frontierBand: "B2", utcOffsetMinutes: 0, now: KIT_NOW };
const LATER = new Date(KIT_NOW.getTime() + 5 * 60_000);

/** Drive a 1-card batch to its seam so the choice is genuine. */
async function atSeam(cards = [card("a", "Recognized")]) {
  const deps = makeBuildDeps(cards);
  const first = await getOrResumeSession(INPUT, deps);
  if (first.kind !== "batch") throw new Error("expected a batch");
  for (const e of first.state.entries) {
    await advanceActiveBatch({ userId: "u1", senseId: e.senseId, ratingLogged: true, now: KIT_NOW }, deps);
  }
  return { deps, firstBatch: first.state };
}

describe("recordSeamChoice", () => {
  it("BAT-9/16: Done records the choice and clears the session", async () => {
    const { deps, firstBatch } = await atSeam();
    const res = await recordSeamChoice({ ...INPUT, choice: "done", now: LATER }, deps);
    expect(res).toEqual({ kind: "done" });
    expect(deps.batchStore.seamChoices).toEqual([
      { batchId: firstBatch.batchId, continueChosen: false },
    ]);
    expect(deps.sessionStatePeek("u1")).toBeUndefined();
  });

  it("BAT-9/10: Continue records the choice and builds the NEXT batch over remaining due state", async () => {
    const { deps, firstBatch } = await atSeam([
      card("a", "Recognized"),
      // A card that was not in the first 1-card... both fit one batch; use a Productive to hold 2 batches
    ]);
    // A card that becomes due mid-batch joins only at the seam rebuild (BAT-10).
    await deps.cards.save(card("late", "Recognized", LATER));
    const res = await recordSeamChoice({ ...INPUT, choice: "continue", now: LATER }, deps);
    expect(res.kind).toBe("batch");
    if (res.kind === "batch") {
      expect(res.state.batchNumber).toBe(firstBatch.batchNumber + 1);
      expect(res.state.entries.map((e) => e.senseId)).toContain("late");
      expect(res.state.progressIndex).toBe(0);
    }
    expect(deps.batchStore.seamChoices).toEqual([
      { batchId: firstBatch.batchId, continueChosen: true },
    ]);
  });

  it("BAT-9: Continue over an exhausted queue resolves to empty", async () => {
    const { deps } = await atSeam();
    // The only card was just rated — but the fake repo leaves its due date unchanged, so it is
    // still due; exhaust it by moving it into the future (as a real reschedule would).
    const a = (await deps.cards.listCards("u1"))[0]!;
    await deps.cards.save({ ...a, fsrs: { ...a.fsrs, due: new Date(LATER.getTime() + 86_400_000) } });
    const res = await recordSeamChoice({ ...INPUT, choice: "continue", now: LATER }, deps);
    expect(res.kind).toBe("empty");
  });
});
