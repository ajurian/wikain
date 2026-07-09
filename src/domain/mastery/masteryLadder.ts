import type { Card, MasteryState } from "./card.js";

/**
 * The mastery-ladder distribution (spec/01 SM-1) — a pure tally over a user's cards for the dashboard.
 * Groups by the four **carded** states in ascending ladder order. `New` is a pre-state with no
 * persisted card (`entryState.ts` seeds `Seen`/`Recognized`, SM-11), so it is deliberately omitted;
 * any stray `New` card is simply not tallied rather than shown.
 *
 * Pure data over a plain array (COMP-3, like `sessionQueue.ts`/`tier.ts`) — no I/O, no scheduler.
 */

/** One rung of the SM-1 ladder with its member count. */
export interface LadderEntry {
  state: Exclude<MasteryState, "New">;
  count: number;
}

/** The carded rungs, in ascending ladder order (SM-1). */
const LADDER: readonly LadderEntry["state"][] = ["Seen", "Recognized", "Productive", "Fluent"];

export function tallyMastery(cards: readonly Card[]): LadderEntry[] {
  const counts = new Map<LadderEntry["state"], number>(LADDER.map((s) => [s, 0]));
  for (const card of cards) {
    const current = counts.get(card.mastery as LadderEntry["state"]);
    if (current !== undefined) counts.set(card.mastery as LadderEntry["state"], current + 1);
  }
  return LADDER.map((state) => ({ state, count: counts.get(state)! }));
}
