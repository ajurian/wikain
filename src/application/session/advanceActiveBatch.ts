import type { SessionStateStore } from "../ports/sessionState.js";
import type { BatchInstrumentationStore } from "../ports/batchInstrumentation.js";

export interface AdvanceActiveBatchInput {
  userId: string;
  /** The card the interaction was about — must match the batch's current card to tick (defensive). */
  senseId: string;
  /** BAT-7: true iff this interaction persisted a ReviewLog (`reviewWasRated`). */
  ratingLogged: boolean;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
}

export interface AdvanceActiveBatchDeps {
  sessionState: SessionStateStore;
  batches: BatchInstrumentationStore;
}

export interface BatchProgress {
  completed: number;
  total: number;
  atSeam: boolean;
}

export type AdvanceActiveBatchResult =
  | { active: true; progress: BatchProgress }
  /** No active batch — the rating already happened and is never blocked by missing presentation state. */
  | { active: false };

/**
 * Advance the active batch after one review interaction (spec/14 BAT-7). The bar ticks exactly when
 * a rating was logged; every interaction — bounce, soft bounce, network no-rating included — stamps
 * `lastInteractionAt` (the BAT-11 absence anchor). Reaching N/N finalizes the instrumentation row as
 * completed (BAT-16); the seam choice is recorded separately (`recordSeamChoice`).
 */
export async function advanceActiveBatch(
  input: AdvanceActiveBatchInput,
  deps: AdvanceActiveBatchDeps,
): Promise<AdvanceActiveBatchResult> {
  const now = input.now ?? new Date();
  const state = await deps.sessionState.load(input.userId);
  if (state === undefined) return { active: false };

  const current = state.entries[state.progressIndex];
  const ticks = input.ratingLogged && current?.senseId === input.senseId;
  const progressIndex = ticks ? state.progressIndex + 1 : state.progressIndex;

  await deps.sessionState.save({ ...state, progressIndex, lastInteractionAt: now });

  if (ticks && progressIndex === state.entries.length) {
    await deps.batches.finalize(state.batchId, {
      outcome: "completed",
      completedCount: progressIndex,
      wallClockMs: now.getTime() - state.startedAt.getTime(),
      finalizedAt: now,
    });
  }

  return {
    active: true,
    progress: {
      completed: progressIndex,
      total: state.entries.length,
      atSeam: progressIndex >= state.entries.length,
    },
  };
}
