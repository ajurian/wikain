import type { ReviewTier } from "../review/review.js";
import {
  BATCH_CARD_CAP,
  BATCH_FP_CAP,
  BATCH_UNIT_BUDGET,
  TIER_EFFORT_UNITS,
} from "../constants.js";

/** BAT-2: a queue card tagged with its resolved tier — the batcher's whole view of a card. */
export interface BatchQueueEntry {
  senseId: string;
  tier: ReviewTier;
}

export interface BuiltBatch {
  entries: BatchQueueEntry[];
  /** BAT-16: the sum of the entries' effort units at build time. */
  plannedUnits: number;
}

/**
 * BAT-3/4/5/6: greedy in-queue-order batch fill, closed by whichever cap hits first. Pure ordering
 * over data — no I/O, like `orderSessionQueue`. Queue order is pedagogy, the budget is pacing:
 * never reorder to pack the budget. The one sanctioned bend (BAT-5): a free production over
 * `BATCH_FP_CAP` is skipped in place — it stays in the (unconsumed) queue and joins a later batch —
 * while lighter cards behind it may still join. An over-budget card closes a non-empty batch; into
 * an empty batch it is admitted, so a single free production can always be served (BAT-4).
 */
export function buildBatch(queue: readonly BatchQueueEntry[]): BuiltBatch {
  const entries: BatchQueueEntry[] = [];
  let units = 0;
  let fp = 0;

  for (const card of queue) {
    const w = TIER_EFFORT_UNITS[card.tier];
    if (card.tier === "free" && fp === BATCH_FP_CAP) continue; // BAT-5: defer, not drop
    if (units + w > BATCH_UNIT_BUDGET && entries.length > 0) break; // BAT-4
    entries.push(card);
    units += w;
    if (card.tier === "free") fp += 1;
    if (entries.length === BATCH_CARD_CAP) break; // BAT-3
  }

  return { entries, plannedUnits: units };
}

/** BAT-16: per-tier composition of a batch, zero-filled so analytics rows are uniform. */
export function tierCounts(entries: readonly BatchQueueEntry[]): Record<ReviewTier, number> {
  const counts: Record<ReviewTier, number> = { recognition: 0, cloze: 0, cued: 0, free: 0 };
  for (const e of entries) counts[e.tier] += 1;
  return counts;
}
