import { scoreLexTale } from "../domain/lextale.js";
import { frontierBandFromLexTale } from "../domain/placement.js";
import type { PlacementProfileStore } from "./ports/placementProfile.js";

export interface RecordLexTaleResultInput {
  userId: string;
  /** The learner's raw yes/no answers, keyed by published item. `true` = "I know this word". */
  answers: ReadonlyMap<string, boolean>;
}

/**
 * Deliberately `{ profile }` ONLY. No `marks`, no `cards`, no `wordSource` — so the type surface makes a
 * SEED-3 violation impossible: this use-case *cannot* mark a word known or select a word even by mistake.
 * (The same trick `judgeFirstProduction`'s deps use to make persistence impossible.)
 */
export interface RecordLexTaleResultDeps {
  profile: PlacementProfileStore;
}

export interface LexTaleResult {
  /** SEED-4: the published averaged-%-correct scalar, in [0, 100]. */
  score: number;
  /** SEED-2 mechanism (i): the band the scalar implies. */
  frontierBand: string;
}

/**
 * Score a completed LexTALE run and persist its two outputs (spec/09 SEED-2/3/4).
 *
 * The answers are scored HERE, not on the client: the scalar moves the learner's frontier band, so a
 * client-computed score would be a self-served placement. `scoreLexTale` throws on a partial or
 * unrecognized answer set, and that throw precedes the write — a short run persists nothing.
 *
 * The scalar's second published output, FSRS cold-start difficulty (SEED-2), stays unwired; see
 * `frontierBandFromLexTale`'s note and `coldStart.ts`.
 */
export async function recordLexTaleResult(
  input: RecordLexTaleResultInput,
  deps: RecordLexTaleResultDeps,
): Promise<LexTaleResult> {
  const score = scoreLexTale(input.answers);
  const frontierBand = frontierBandFromLexTale(score);
  await deps.profile.write(input.userId, { lextaleScore: score, frontierBand });
  return { score, frontierBand };
}
