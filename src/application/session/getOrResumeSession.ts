import { shouldResumeBatch } from "~/domain/scheduling/absence.js";
import type { ActiveSessionState } from "../ports/sessionState.js";
import {
  buildSessionBatch,
  type BuildSessionBatchDeps,
} from "./buildSessionBatch.js";

export interface GetOrResumeSessionInput {
  userId: string;
  frontierBand: string;
  utcOffsetMinutes: number;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
}

export type GetOrResumeSessionDeps = BuildSessionBatchDeps;

/** How the (re)presented batch should be framed (BAT-12/13) — copy, not mechanism. */
export type SessionFraming = "fresh" | "resumed" | "welcomeBack";

export type GetOrResumeSessionResult =
  | { kind: "batch"; framing: SessionFraming; state: ActiveSessionState }
  /** Resumed at N/N with the Continue/Done choice still pending (BAT-12's resume-to-seam). */
  | { kind: "seam"; state: ActiveSessionState }
  | { kind: "empty" };

/**
 * The single session entry point (spec/14 BAT-11/12/13): every arrival at the review screen —
 * navigation, reload, app kill, cold start — resolves through this ONE two-branch check; there is
 * deliberately no third path.
 *
 *  - Active state within `BATCH_ABSENCE_T_MINUTES` of the last interaction → resume at true
 *    progress (mid-batch, or at the seam when N/N was reached but no choice made) — BAT-12.
 *  - Expired state → finalize the stale batch's instrumentation row as abandoned (its logged
 *    ratings are untouched and untouchable — BAT-1), rebuild from current due state, and present
 *    "Welcome back — 0/M"; the old bar is never rendered — BAT-13.
 *  - No state at all → build fresh.
 */
export async function getOrResumeSession(
  input: GetOrResumeSessionInput,
  deps: GetOrResumeSessionDeps,
): Promise<GetOrResumeSessionResult> {
  const now = input.now ?? new Date();
  const existing = await deps.sessionState.load(input.userId);

  if (
    existing !== undefined &&
    shouldResumeBatch(existing.lastInteractionAt, now)
  ) {
    return existing.progressIndex < existing.entries.length
      ? { kind: "batch", framing: "resumed", state: existing }
      : { kind: "seam", state: existing };
  }

  if (
    existing !== undefined &&
    existing.progressIndex < existing.entries.length
  ) {
    // BAT-16: the stale batch finalizes at its true position; a batch that had reached N/N was
    // already finalized `completed` by the advance (the seam choice simply stays unrecorded).
    await deps.batches.finalize(existing.batchId, {
      outcome: "abandoned",
      completedCount: existing.progressIndex,
      abandonedAtPosition: existing.progressIndex,
      ...(existing.entries[existing.progressIndex] === undefined
        ? {}
        : { abandonedAtTier: existing.entries[existing.progressIndex]!.tier }),
      // Clamped: a clock skew (or an operator editing timestamps) must not record a negative span.
      wallClockMs: Math.max(
        0,
        existing.lastInteractionAt.getTime() - existing.startedAt.getTime(),
      ),
      finalizedAt: now,
    });
  }

  const built = await buildSessionBatch(
    {
      userId: input.userId,
      frontierBand: input.frontierBand,
      utcOffsetMinutes: input.utcOffsetMinutes,
      batchNumber: 1,
      now,
    },
    deps,
  );
  if (built.kind === "empty") return { kind: "empty" };
  return {
    kind: "batch",
    framing: existing !== undefined ? "welcomeBack" : "fresh",
    state: built.state,
  };
}
