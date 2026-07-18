import {
  FIRST_SESSION_SEED_WORDS,
  NEW_PER_DAY,
  NEW_FRACTION_UNDER_BACKLOG,
} from "../constants.js";

export interface PacingInput {
  /** SEED-1/6: the user's very first session seeds a fixed small batch, ignoring the daily pace. */
  isFirstSession: boolean;
  /** Count of the user's cards currently due for review (the backlog reviews must not starve). */
  dueBacklog: number;
}

/**
 * SEED-6: how many new words to introduce this session, so reviews never starve.
 *  - First session → `FIRST_SESSION_SEED_WORDS` (SEED-1: deliver a production win fast).
 *  - No backlog → the full daily pace `NEW_PER_DAY`.
 *  - Under a backlog → capped so new introductions are ≤ `NEW_FRACTION_UNDER_BACKLOG` OF THE SESSION
 *    (new + due), whichever is smaller than `NEW_PER_DAY`.
 *
 * "Of the session" (SEED-6 scenario) means new / (new + due) ≤ f. Solving for the largest integer
 * `new`: new ≤ f·(new + due) ⇒ new ≤ (f / (1 − f))·due. Hence the closed-form cap below; at the cap
 * exactly new / (new + due) = f, so flooring keeps it ≤ f. `dueBacklog` is the only signal needed —
 * no externally-supplied session size, which would be circular.
 *
 * SEED-9: this intro pace is an independent knob from the §9 daily USE-goal (`DAILY_GOAL_DEFAULT`);
 * they merely share the default value 5. A new introduction is a `Seen` interaction, not a productive
 * use, so this function never consults the use-goal.
 */
export function newIntroductionsAllowed({
  isFirstSession,
  dueBacklog,
}: PacingInput): number {
  if (isFirstSession) return FIRST_SESSION_SEED_WORDS;
  if (dueBacklog <= 0) return NEW_PER_DAY;
  const f = NEW_FRACTION_UNDER_BACKLOG;
  const backlogCap = Math.floor((f / (1 - f)) * dueBacklog);
  return Math.min(NEW_PER_DAY, backlogCap);
}
