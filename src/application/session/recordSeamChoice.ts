import type { ActiveSessionState } from "../ports/sessionState.js";
import {
  buildSessionBatch,
  type BuildSessionBatchDeps,
} from "./buildSessionBatch.js";

export interface RecordSeamChoiceInput {
  userId: string;
  /** BAT-9: the explicit choice at the N/N seam. */
  choice: "continue" | "done";
  frontierBand: string;
  utcOffsetMinutes: number;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
}

export type RecordSeamChoiceDeps = BuildSessionBatchDeps;

export type RecordSeamChoiceResult =
  | { kind: "batch"; state: ActiveSessionState }
  | { kind: "empty" }
  | { kind: "done" };

/**
 * Record the learner's Continue/Done at the completion seam (spec/14 BAT-9/16). Continue builds the
 * next batch over the remaining due queue (BAT-10: this is where mid-session newly-due cards join;
 * BAT-14: same-day, so no re-seed). Done clears the session — there is simply no active batch
 * afterwards. The choice lands on the completed batch's instrumentation row either way.
 */
export async function recordSeamChoice(
  input: RecordSeamChoiceInput,
  deps: RecordSeamChoiceDeps,
): Promise<RecordSeamChoiceResult> {
  const now = input.now ?? new Date();
  const state = await deps.sessionState.load(input.userId);

  if (state !== undefined) {
    await deps.batches.recordSeamChoice(state.batchId, input.choice === "continue");
  }

  if (input.choice === "done") {
    await deps.sessionState.clear(input.userId);
    return { kind: "done" };
  }

  const built = await buildSessionBatch(
    {
      userId: input.userId,
      frontierBand: input.frontierBand,
      utcOffsetMinutes: input.utcOffsetMinutes,
      batchNumber: (state?.batchNumber ?? 0) + 1,
      now,
    },
    deps,
  );
  return built.kind === "empty" ? { kind: "empty" } : built;
}
