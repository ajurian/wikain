import type { PlacementMarksStore } from "../ports/placementMarks.js";

export interface RecordPlacementMarksInput {
  userId: string;
  /** The senseIds the learner flagged placement-known in onboarding (SEED-2). */
  senseIds: readonly string[];
}

export interface RecordPlacementMarksDeps {
  marks: PlacementMarksStore;
}

/**
 * Persist a learner's per-word placement marks (spec/09 SEED-2). A thin write over the store — the
 * marks carry no logic of their own; their sole effect is realized later, when `seedIntroductions`
 * reads them and enters a marked word at `Recognized` instead of `Seen` (SEED-7 / SM-11). Kept as a
 * use-case (not a direct port call from the server) so the presentation depends only on application
 * (ARCH-1) and this write is covered/substitutable like every other.
 */
export async function recordPlacementMarks(
  input: RecordPlacementMarksInput,
  deps: RecordPlacementMarksDeps,
): Promise<void> {
  await deps.marks.record(input.userId, input.senseIds);
}
