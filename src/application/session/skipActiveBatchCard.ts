import type { SessionStateStore } from "../ports/sessionState.js";
import type { BatchInstrumentationStore } from "../ports/batchInstrumentation.js";
import type {
  AdvanceActiveBatchResult,
  AdvanceActiveBatchDeps,
} from "./advanceActiveBatch.js";

export interface SkipActiveBatchCardInput {
  userId: string;
  senseId: string;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
}

export type SkipActiveBatchCardDeps = AdvanceActiveBatchDeps & {
  sessionState: SessionStateStore;
  batches: BatchInstrumentationStore;
};

/**
 * Remove the batch's current card after a terminal no-rating skip (spec/14 BAT-8): the RL-6 capped
 * reveal+skip or the NET-3 persistent-failure skip. The denominator shrinks — no units credited, no
 * tick — so the bar cannot stall short of N. The card itself stays due and unrated (INV-2 is the
 * review path's concern, untouched here). A shrink that reaches N finalizes the batch as completed:
 * the learner worked through everything the batch still held.
 */
export async function skipActiveBatchCard(
  input: SkipActiveBatchCardInput,
  deps: SkipActiveBatchCardDeps,
): Promise<AdvanceActiveBatchResult> {
  const now = input.now ?? new Date();
  const state = await deps.sessionState.load(input.userId);
  if (state === undefined) return { active: false };

  const current = state.entries[state.progressIndex];
  const entries =
    current?.senseId === input.senseId
      ? state.entries.filter((_, i) => i !== state.progressIndex)
      : state.entries;

  await deps.sessionState.save({ ...state, entries, lastInteractionAt: now });

  const atSeam = state.progressIndex >= entries.length;
  if (entries !== state.entries && atSeam) {
    await deps.batches.finalize(state.batchId, {
      outcome: "completed",
      completedCount: state.progressIndex,
      wallClockMs: now.getTime() - state.startedAt.getTime(),
      finalizedAt: now,
    });
  }

  return {
    active: true,
    progress: {
      completed: state.progressIndex,
      total: entries.length,
      atSeam,
    },
  };
}
