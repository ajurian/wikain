import { isLemmaMatch } from "../domain/review/grading.js";
import { promoteOnClozePass } from "../domain/mastery/mastery.js";
import {
  submitDeterministicReview,
  type DeterministicReviewDeps,
  type DeterministicReviewResult,
} from "./submitDeterministicReview.js";
import type { Lemmatizer } from "./ports/lemmatizer.js";

export interface SubmitClozeInput {
  userId: string;
  senseId: string;
  response: string;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
}

export interface SubmitClozeDeps extends DeterministicReviewDeps {
  lemmatizer: Lemmatizer;
}

export type SubmitClozeResult = DeterministicReviewResult;

/**
 * The typed-cloze on-ramp tier (spec/03 TIER-1/TIER-5), the second `Seen` step. A thin config over
 * `submitDeterministicReview`:
 *  - TIER-5: grade by the SAME inflection-agnostic lemma-match as cued (cloze and cued differ only in
 *    cue richness, TIER-3) — no judge/LLM (INV-1).
 *  - SM-3: a pass promotes Seen → Recognized (the prior MCQ pass is guaranteed by the on-ramp routing
 *    in `runReviewPass`, so `promoteOnClozePass` need not re-check it).
 *  - SM-6 / RAT-7: a fail never demotes; the drop-back to the MCQ is a routing decision
 *    (`onRampLedger.nextSeenTier`), not a mastery change — so nothing about it belongs in this core.
 */
export async function submitCloze(
  input: SubmitClozeInput,
  deps: SubmitClozeDeps,
): Promise<SubmitClozeResult> {
  return submitDeterministicReview(input, deps, {
    tier: "cloze",
    grade: (item) => isLemmaMatch(deps.lemmatizer.formsOf(input.response), item.lemma),
    promote: (state, passed) => promoteOnClozePass(state, passed),
  });
}
