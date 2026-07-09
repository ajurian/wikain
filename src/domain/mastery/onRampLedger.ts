import type { ReviewLog } from "../review/review.js";

/**
 * The `Seen` on-ramp ledger (spec/01 SM-3, spec/02 RAT-7) — a pure reduction over a word's ReviewLog
 * history that answers ONE question: which on-ramp tier does the next `Seen` presentation show,
 * `recognition` (meaning→word MCQ) or `cloze` (typed cloze)?
 *
 * Like `judgedPassLedger.ts`, the sub-state within `Seen` is DERIVED from the persisted logs (DM-6),
 * not stored as a running Card field — so there is one source of truth and no drift (INV-4). The
 * `Card` carries only the coarse `mastery === "Seen"`; the fine-grained MCQ→cloze position is replayed
 * from the logs each pass.
 *
 * The two-step sequence (SM-3): a word enters `Seen` showing the MCQ; a passing MCQ advances it to the
 * cloze; the cloze pass is what promotes `Seen → Recognized` (handled by `promoteOnClozePass`, so it
 * never appears as a still-`Seen` log here). The drop-back (RAT-7): the FIRST cloze fail drops back to
 * the MCQ for exactly `SEEN_CLOZE_DROPBACK_CAP` (=1) rep, then re-attempts cloze; a second cloze fail
 * stays on cloze (no MCQ↔cloze ping-pong). The cap is encoded by the sticky `dropbackUsed` flag.
 *
 * Logs are assumed chronological (the order `logsForWord` returns — DM-6 preserves append order via
 * `seq`); the fold replays them in that order. Non-on-ramp tiers are ignored defensively — a `Seen`
 * card only ever accrues recognition/cloze logs.
 */
export type SeenTier = "recognition" | "cloze";

type FoldMode = "recognition" | "cloze" | "dropback";

export function nextSeenTier(logs: readonly ReviewLog[]): SeenTier {
  let mode: FoldMode = "recognition";
  let dropbackUsed = false;

  for (const log of logs) {
    const passed = log.rating === "Good";
    if (mode === "recognition") {
      // Awaiting the first MCQ pass. SM-3: only a pass advances to cloze; a fail keeps the MCQ.
      if (log.tier === "recognition" && passed) mode = "cloze";
    } else if (mode === "dropback") {
      // RAT-7: the one drop-back MCQ rep re-attempts cloze regardless of its pass/fail.
      if (log.tier === "recognition") mode = "cloze";
    } else {
      // mode === "cloze": awaiting a cloze pass. A pass promotes out of Seen (no such log survives
      // here, promoteOnClozePass); the first fail drops back once (RAT-7), later fails stay on cloze.
      if (log.tier === "cloze" && !passed) {
        if (!dropbackUsed) {
          mode = "dropback";
          dropbackUsed = true;
        }
      }
    }
  }

  return mode === "cloze" ? "cloze" : "recognition";
}
