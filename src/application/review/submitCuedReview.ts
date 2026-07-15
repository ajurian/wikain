import { formsOf, isLemmaMatch } from "~/domain/review/grading.js";
import { promoteOnCuedPass } from "~/domain/mastery/mastery.js";
import {
  submitDeterministicReview,
  type DeterministicReviewDeps,
  type DeterministicReviewResult,
} from "./submitDeterministicReview.js";
import type { SentenceAnalyzer } from "../ports/sentenceAnalyzer.js";

export interface SubmitCuedReviewInput {
  userId: string;
  senseId: string;
  response: string;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
}

export interface SubmitCuedReviewDeps extends DeterministicReviewDeps {
  analyzer: SentenceAnalyzer;
}

export type SubmitCuedReviewResult = DeterministicReviewResult;

/**
 * The cued-production review pass — the deterministic branch of the end-to-end loop
 * (spec/11-end-to-end-loop.md LOOP). A thin config over `submitDeterministicReview`:
 *  - TIER-3 / TIER-5: grade by inflection-agnostic en-US lemma-match (no judge/LLM, INV-1). The
 *    SentenceAnalyzer port supplies tokens; the pure `formsOf` + `isLemmaMatch` decide the verdict
 *    (the domain holds no NLP dependency).
 *  - SM-4: a pass promotes Recognized → Productive; SM-6: a fail leaves mastery untouched.
 * Rating/scheduling/single-log semantics (RAT-1/8, INV-3, DM-6) live in the shared core.
 */
export async function submitCuedReview(
  input: SubmitCuedReviewInput,
  deps: SubmitCuedReviewDeps,
): Promise<SubmitCuedReviewResult> {
  return submitDeterministicReview(input, deps, {
    tier: "cued",
    grade: async (item) =>
      isLemmaMatch(formsOf(await deps.analyzer.analyze(input.response)), item.lemma),
    promote: (state, passed) => (passed ? promoteOnCuedPass(state) : state),
    // RAT-5: cued is a typed tier where tolerance WOULD apply, but no typo lane exists on cued
    // (FIT-9 is cloze-only) — so the signal is an honest measured `false`, not an omission.
    logExtras: { typoFixed: false },
  });
}
