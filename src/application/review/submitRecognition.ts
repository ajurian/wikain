import { isRecognitionCorrect } from "~/domain/review/grading.js";
import {
  submitDeterministicReview,
  type DeterministicReviewDeps,
  type DeterministicReviewResult,
} from "./submitDeterministicReview.js";

export interface SubmitRecognitionInput {
  userId: string;
  senseId: string;
  /** The word the learner picked from the MCQ options (TIER-2). Graded by identity to the target. */
  response: string;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
}

export type SubmitRecognitionDeps = DeterministicReviewDeps;

export type SubmitRecognitionResult = DeterministicReviewResult;

/**
 * The meaning→word recognition MCQ on-ramp tier (spec/03 TIER-1/TIER-2), the first `Seen` step. A thin
 * config over `submitDeterministicReview`:
 *  - TIER-2: grade by exact identity to the target word (the MCQ is pick-the-word, not lemma-match) —
 *    no judge/LLM (INV-1), no lemmatizer needed.
 *  - SM-3: an MCQ pass alone does NOT promote (it only advances the on-ramp to the cloze via
 *    `onRampLedger.nextSeenTier`), so the promotion strategy is the identity map; SM-6: a fail never
 *    demotes.
 */
export async function submitRecognition(
  input: SubmitRecognitionInput,
  deps: SubmitRecognitionDeps,
): Promise<SubmitRecognitionResult> {
  return submitDeterministicReview(input, deps, {
    tier: "recognition",
    grade: (item) => isRecognitionCorrect(input.response, item.word),
    promote: (state) => state,
  });
}
