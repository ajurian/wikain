import { formsOf } from "~/domain/review/grading.js";
import { resolveCuedLane } from "~/domain/review/cuedSynonyms.js";
import { CUED_SOFT_BOUNCE_CAP } from "~/domain/constants.js";
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
  /**
   * CUE-7: synonym soft bounces already accrued on THIS presentation. The use-case is stateless —
   * the presentation owns per-presentation retry state and passes it in (the FIT-8 / RL-6 pattern).
   * Defaults to 0.
   */
  priorSoftBounces?: number;
  /** BAT-15: client-measured card-shown → submit span; recorded on graded lanes, never rated on. */
  durationMs?: number;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
}

export interface SubmitCuedReviewDeps extends DeterministicReviewDeps {
  analyzer: SentenceAnalyzer;
}

/**
 * CUE-6: a no-rating cued soft bounce — no scheduler call, no ReviewLog, the card stays due. NOT an
 * INV-2 bounce (the input is a well-formed, meaning-correct synonym); a distinct no-rating class that
 * parallels the cloze FIT-7 soft bounce (CUE-6), never a shared code path.
 */
export interface CuedSoftBounceResult {
  kind: "softBounce";
  /** Synonym soft bounces accrued on this presentation including this one. */
  bounces: number;
  /** The first letter of the target — the "j___" cue the callout carries (CUE-7). */
  hintPrefix: string;
}

export type SubmitCuedReviewResult =
  | ({ kind: "graded" } & DeterministicReviewResult)
  | CuedSoftBounceResult;

/**
 * The cued-production review pass — the deterministic branch of the end-to-end loop
 * (spec/11-end-to-end-loop.md LOOP), now with the spec/15 synonym soft-bounce lane. One NLP analyze
 * call resolves the lane (CUE-5's precedence table); the graded lanes then run through the shared
 * deterministic core:
 *  - `target` — the TIER-5 lemma match → `Good`; SM-4: a pass promotes Recognized → Productive.
 *  - `typo` — DL ≤ CUED_TYPO_MAX_DISTANCE of the target (CUE-5.1) → `Good` with `typoFixed: true`.
 *  - `synonym` under the cap — a CUE-6 soft bounce: returns early with NO rating, NO scheduler call,
 *    NO ReviewLog (the card stays due, untouched); the word stays Recognized (no promotion, CUE-5.2).
 *  - a `synonym` lane AT the cap (CUE-7a) — grades the wrong path (`Again`); the caller reveals.
 *  - `wrong` — `Again`; SM-6: a deterministic fail never demotes (cued is at the Recognized floor).
 *
 * `softBounceCount` is recorded on the final graded ReviewLog (0 when none) — the CUE-11 instrument
 * signal folded into the log, mirroring FIT-10. The separate CUE-11 instrumentation stream (the
 * produced-synonym log) is Deferred.
 */
export async function submitCuedReview(
  input: SubmitCuedReviewInput,
  deps: SubmitCuedReviewDeps,
): Promise<SubmitCuedReviewResult> {
  const item = deps.catalog.get(input.senseId);
  if (item === undefined) throw new Error(`unknown sense_id: ${input.senseId}`);

  // CUE-8: one NLP call; the synonym membership test reuses its forms (every NLP call is an RPC).
  const tokens = await deps.analyzer.analyze(input.response);
  const lane = resolveCuedLane({
    responseForms: formsOf(tokens),
    responseRaw: input.response,
    targetLemma: item.lemma,
    synonyms: item.cued_valid_synonyms,
  });

  const priorBounces = input.priorSoftBounces ?? 0;

  if (lane.kind === "synonym" && priorBounces + 1 < CUED_SOFT_BOUNCE_CAP) {
    // CUE-6: no rating, no scheduler, no log — the card stays due, untouched.
    return { kind: "softBounce", bounces: priorBounces + 1, hintPrefix: item.lemma.charAt(0) };
  }

  // CUE-7a: a synonym lane at the cap stops bouncing and grades the wrong path (Again + reveal).
  const capped = lane.kind === "synonym";
  const passed = lane.kind === "target" || lane.kind === "typo";
  const softBounceCount = capped ? priorBounces + 1 : priorBounces;

  const graded = await submitDeterministicReview(input, deps, {
    tier: "cued",
    grade: () => passed,
    promote: (state, ok) => (ok ? promoteOnCuedPass(state) : state),
    // CUE-5.1 / CUE-11: measured signals — the typo lane, and this presentation's synonym-bounce
    // count (0 is an honest measurement on cued, which now carries a synonym lane).
    logExtras: { typoFixed: lane.kind === "typo", softBounceCount },
  });
  return { kind: "graded", ...graded };
}
