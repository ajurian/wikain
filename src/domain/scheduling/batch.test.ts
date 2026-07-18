import { describe, expect, it } from "vitest";
import { BATCH_CARD_CAP, BATCH_UNIT_BUDGET, TIER_EFFORT_UNITS } from "../constants.js";
import type { ReviewTier } from "../review/review.js";
import { buildBatch, tierCounts, type BatchQueueEntry } from "./batch.js";

let n = 0;
function entry(tier: ReviewTier): BatchQueueEntry {
  return { senseId: `sense_${tier}_${n++}`, tier };
}
function entries(...tiers: ReviewTier[]): BatchQueueEntry[] {
  return tiers.map(entry);
}

describe("buildBatch (BAT-3/4/5/6)", () => {
  it("BAT-4: fills greedily in queue order, never reordering to pack the budget", () => {
    const queue = entries("recognition", "cloze", "cued", "recognition");
    const batch = buildBatch(queue);
    expect(batch.entries).toEqual(queue);
    expect(batch.plannedUnits).toBe(1 + 2 + 2 + 1);
  });

  it("BAT-4: a card that would exceed the unit budget closes a non-empty batch", () => {
    // 12 units of light cards, then a free (10) would hit 22 > 20.
    const queue = entries("cloze", "cloze", "cloze", "cloze", "cloze", "cloze", "free");
    const batch = buildBatch(queue);
    expect(batch.entries).toEqual(queue.slice(0, 6));
    expect(batch.plannedUnits).toBe(12);
  });

  it("BAT-4: a lone over-budget card is admitted into an empty batch", () => {
    // Weights are tunable; simulate a queue-head card whose weight exceeds the budget by
    // stacking frees: the FIRST card is always admitted even at weight 10 (and would be
    // even if a tier's weight exceeded BATCH_UNIT_BUDGET outright).
    const queue = entries("free");
    const batch = buildBatch(queue);
    expect(batch.entries).toEqual(queue);
    expect(batch.plannedUnits).toBe(TIER_EFFORT_UNITS.free);
  });

  it("BAT-3: the unit budget admits exactly two frees (2×10 = budget), closing on the third card", () => {
    const queue = entries("free", "free", "recognition");
    const batch = buildBatch(queue);
    // 10 + 10 = 20 = budget; the MCQ would make 21 > 20 and closes the batch.
    expect(batch.entries).toEqual(queue.slice(0, 2));
    expect(batch.plannedUnits).toBe(BATCH_UNIT_BUDGET);
  });

  it("BAT-3: the card cap binds on an all-MCQ queue", () => {
    const queue = entries(...Array<ReviewTier>(15).fill("recognition"));
    const batch = buildBatch(queue);
    expect(batch.entries).toHaveLength(BATCH_CARD_CAP);
    expect(batch.plannedUnits).toBe(BATCH_CARD_CAP * TIER_EFFORT_UNITS.recognition);
  });

  it("BAT-5: a free production over the FP cap defers in place — later light cards still join", () => {
    const queue = entries("free", "free", "free", "recognition");
    const batch = buildBatch(queue);
    // FP3 is skipped (deferred), MCQ1 would exceed the budget (20 + 1) and closes the batch.
    expect(batch.entries).toEqual([queue[0], queue[1]]);
  });

  it("BAT-5: the deferred FP keeps its queue position for the next build", () => {
    const queue = entries("free", "free", "free", "recognition");
    const first = buildBatch(queue);
    const served = new Set(first.entries.map((e) => e.senseId));
    const remaining = queue.filter((e) => !served.has(e.senseId));
    // The deferral never removed FP3 from the queue: it simply was not served.
    expect(remaining[0]).toEqual(queue[2]);
    const second = buildBatch(remaining);
    expect(second.entries[0]).toEqual(queue[2]);
  });

  it("BAT-5: deferral admits lighter cards under the budget after the FP cap is hit", () => {
    const queue = entries("free", "free", "free", "cloze", "recognition");
    const batch = buildBatch(queue);
    // free(10) + free(10) = 20; the third free defers (FP cap), and cloze/MCQ would exceed
    // the budget into a non-empty batch — but the deferral itself never closed the batch.
    expect(batch.entries).toEqual([queue[0], queue[1]]);
    expect(batch.plannedUnits).toBe(20);
  });

  it("BAT-6: a remainder queue presents at its natural smaller size", () => {
    const queue = entries("recognition", "cloze", "cued");
    const batch = buildBatch(queue);
    expect(batch.entries).toHaveLength(3);
    expect(batch.plannedUnits).toBe(5);
  });

  it("BAT-4: construction is deterministic — same queue, same batch", () => {
    const queue = entries("free", "cloze", "recognition", "free", "cued", "free");
    expect(buildBatch(queue)).toEqual(buildBatch(queue));
  });

  it("BAT-4: an empty queue yields an empty batch", () => {
    const batch = buildBatch([]);
    expect(batch.entries).toEqual([]);
    expect(batch.plannedUnits).toBe(0);
  });

  it("BAT-4: an over-budget second free closes the batch even below the FP cap", () => {
    // free(10) + cloze(12) → the next free would reach 22 > 20 and closes the batch.
    const queue = entries("free", "cloze", "free", "cloze", "cloze");
    const batch = buildBatch(queue);
    expect(batch.entries).toEqual([queue[0], queue[1]]);
    expect(batch.plannedUnits).toBe(12);
  });
});

describe("tierCounts (BAT-16)", () => {
  it("counts each tier in the batch, zero-filling absent tiers", () => {
    const counts = tierCounts(entries("free", "cloze", "cloze", "recognition"));
    expect(counts).toEqual({ recognition: 1, cloze: 2, cued: 0, free: 1 });
  });
});
