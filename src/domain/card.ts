/**
 * Per-user scheduling/mastery entity (spec/12-data-model.md DM-5, DM-7). One Card per word per
 * user (SM-2); tiers are views over this single card, never separate FSRS objects.
 */

/** The mastery ladder (spec/01-state-machine.md SM-1). */
export type MasteryState = "New" | "Seen" | "Recognized" | "Productive" | "Fluent";

/**
 * FSRS scheduling state — structurally the ts-fsrs `Card` (a plain object with `Date` fields).
 * Declared here rather than imported from ts-fsrs so the domain stays library-free (ARCH-1); the
 * infrastructure scheduler adapter maps to/from the ts-fsrs type at the boundary.
 *
 * INV-3 / RAT-6: `state` is the FSRS *internal* state and MUST NOT be read as the mastery state.
 */
export interface FsrsCardState {
  due: Date;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: Date;
}

/**
 * One FSRS card per word, per user (SM-2, DM-5). `mastery` is persisted SEPARATELY from the FSRS
 * internal state and is never derived from it (INV-3, DM-7).
 */
export interface Card {
  userId: string;
  senseId: string;
  mastery: MasteryState;
  fsrs: FsrsCardState;
}
