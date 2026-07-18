import { BATCH_ABSENCE_T_MINUTES } from "../constants.js";

/**
 * BAT-11/12/13: the single two-branch absence check — resume the active batch (≤ T since last
 * interaction, boundary inclusive) or discard-and-rebuild (> T). Every caller (in-app return, app
 * kill, cold start) resolves through this one predicate; there is deliberately no third path.
 * Connectivity is decoupled by construction: network no-ratings never ticked the bar (BAT-7), so
 * expiry never needs to "fix" the counter.
 */
export function shouldResumeBatch(
  lastInteractionAt: Date,
  now: Date,
  timeoutMinutes: number = BATCH_ABSENCE_T_MINUTES,
): boolean {
  return now.getTime() - lastInteractionAt.getTime() <= timeoutMinutes * 60_000;
}
