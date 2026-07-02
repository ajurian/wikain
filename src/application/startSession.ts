import type { Card } from "../domain/card.js";
import { orderSessionQueue } from "../domain/sessionQueue.js";
import {
  seedIntroductions,
  type SeedIntroductionsInput,
  type SeedIntroductionsDeps,
} from "./seedIntroductions.js";

/** Input mirrors seeding (a session begins by pacing new intros, then surfacing what is due). */
export type StartSessionInput = SeedIntroductionsInput;

/**
 * `orderSessionQueue` needs only `cards` (already in the seeding dep set), so a session begins with the
 * exact seeding dependencies — one object forwards to both, mirroring `RunReviewPassDeps`.
 */
export type StartSessionDeps = SeedIntroductionsDeps;

export interface StartSessionResult {
  /** The ordered `senseId`s to walk through `runReviewPass`, one at a time (LOOP-1 step 1). */
  queue: string[];
  /** The cards seeded this session (SEED-1/6); surfaced so the caller can react (e.g. a "new words" cue). */
  seeded: Card[];
}

/**
 * The single session-start entry point the presentation calls (spec/11 LOOP-1 step 1). A thin
 * orchestrator, analogous to how `runReviewPass` sequences sub-use-cases:
 *  1. `seedIntroductions` — paced/capped new-word creation (SEED-1/6/7); returns the created cards.
 *  2. load all the user's cards and order the due ones into a session queue (`orderSessionQueue`),
 *     interleaving the freshly-seeded intros among the due reviews (SEED-6).
 *
 * The seeder already knows exactly which cards it created, so the fresh-intro set is passed to the
 * ordering explicitly (no `reps`/mastery heuristic, no INV-3 concern).
 *
 * Note: seeding is paced per invocation, not per calendar day — calling `startSession` twice in one day
 * seeds twice. That is a pre-existing property of `seedIntroductions` (it has no day ledger), not
 * introduced here; a per-day throttle is deferred (PRAG-1).
 */
export async function startSession(
  input: StartSessionInput,
  deps: StartSessionDeps,
): Promise<StartSessionResult> {
  const now = input.now ?? new Date();
  const seeded = await seedIntroductions(input, deps);
  const all = await deps.cards.listCards(input.userId);
  const queue = orderSessionQueue(
    all,
    seeded.map((c) => c.senseId),
    now,
  );
  return { queue, seeded };
}
