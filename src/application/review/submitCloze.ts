import { formsOf } from "~/domain/review/grading.js";
import {
  healCandidateLemma,
  resolveClozeLane,
  type ClozeSoftBounceLane,
} from "~/domain/review/clozeFitSet.js";
import { CLOZE_SOFT_BOUNCE_CAP } from "~/domain/constants.js";
import { promoteOnClozePass } from "~/domain/mastery/mastery.js";
import {
  submitDeterministicReview,
  type DeterministicReviewDeps,
  type DeterministicReviewResult,
} from "./submitDeterministicReview.js";
import type { SentenceAnalyzer } from "../ports/sentenceAnalyzer.js";
import type { HealQueuePort } from "../ports/healQueue.js";

export interface SubmitClozeInput {
  userId: string;
  senseId: string;
  response: string;
  /**
   * FIT-8: soft bounces already accrued on THIS presentation. The use-case is stateless — the
   * presentation owns per-presentation retry state and passes it in (the RL-6 `priorBounces`
   * pattern). Defaults to 0.
   */
  priorSoftBounces?: number;
  /** FIT-10: the lanes those bounces took, in order — recorded on the final graded ReviewLog. */
  priorSoftBounceLanes?: ClozeSoftBounceLane[];
  /** BAT-15: client-measured card-shown → submit span; recorded on graded lanes, never rated on. */
  durationMs?: number;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
}

export interface SubmitClozeDeps extends DeterministicReviewDeps {
  analyzer: SentenceAnalyzer;
  /** FIT-11: where an unlisted-but-plausible wrong-path word is logged (anonymous, deduplicated). */
  healQueue: HealQueuePort;
}

/**
 * FIT-7: a no-rating soft bounce — no scheduler call, no ReviewLog, the card stays due. NOT an
 * INV-2 bounce (the input is well-formed); a distinct no-rating graded-interaction class.
 */
export interface ClozeSoftBounceResult {
  kind: "softBounce";
  lane: ClozeSoftBounceLane;
  /** Soft bounces accrued on this presentation including this one. */
  bounces: number;
  /** The first letter of the target — the "o___" cue both bounce copies carry (FIT-6). */
  hintPrefix: string;
  /** FIT-4: the item's `bounce_gloss`; present only on the `different_sense_fit` lane. */
  gloss: string | null;
}

export type SubmitClozeResult =
  | ({ kind: "graded" } & DeterministicReviewResult)
  | ClozeSoftBounceResult;

/**
 * The typed-cloze tier (spec/03 TIER-1/TIER-5 + spec/13 FIT-6..11), the second `Seen` on-ramp step.
 * One NLP call resolves the lane (FIT-6's precedence table); the graded lanes then run
 * through the shared deterministic core:
 *  - `target` — the TIER-5 lemma match → `Good`; SM-3: a pass promotes Seen → Recognized.
 *  - `same_sense_near_miss` / `different_sense_fit` under the cap — a FIT-7 soft bounce: returns
 *    early with NO rating, NO scheduler call, NO ReviewLog (FIT-7's phantom-lapse rule).
 *  - a soft lane AT the cap (FIT-8) — grades the wrong path (`Again`); the caller reveals.
 *  - typo (DL ≤ CLOZE_TYPO_MAX_DISTANCE, FIT-9) → `Good` with `typoFixed: true` recorded.
 *  - `wrong` — `Again`, plus the FIT-11 heal-queue write when the response was a single plausible
 *    word (the write never changes the graded outcome).
 *  - SM-6 / RAT-7: a fail never demotes; the MCQ drop-back is routing (`nextSeenTier`), not here.
 */
export async function submitCloze(
  input: SubmitClozeInput,
  deps: SubmitClozeDeps,
): Promise<SubmitClozeResult> {
  const item = deps.catalog.get(input.senseId);
  if (item === undefined) throw new Error(`unknown sense_id: ${input.senseId}`);

  // FIT-6: one NLP call; forms and heal-candidacy both derive from it (every NLP call is an RPC).
  const tokens = await deps.analyzer.analyze(input.response);
  const lane = resolveClozeLane({
    responseForms: formsOf(tokens),
    responseRaw: input.response,
    targetLemma: item.lemma,
    fitSet: item.cloze_fit_set,
  });

  const priorBounces = input.priorSoftBounces ?? 0;
  const priorLanes = input.priorSoftBounceLanes ?? [];

  if (lane.kind === "soft" && priorBounces + 1 < CLOZE_SOFT_BOUNCE_CAP) {
    // FIT-7: no rating, no scheduler, no log — the card stays due, untouched.
    return {
      kind: "softBounce",
      lane: lane.lane,
      bounces: priorBounces + 1,
      hintPrefix: item.lemma.charAt(0),
      gloss: lane.lane === "different_sense_fit" ? item.bounce_gloss : null,
    };
  }

  // FIT-8: a soft lane at the cap stops bouncing and grades the wrong path (Again + reveal).
  const capped = lane.kind === "soft";
  const passed = lane.kind === "target" || lane.kind === "typo";
  const softBounceCount = capped ? priorBounces + 1 : priorBounces;
  const softBounceLanes = capped ? [...priorLanes, lane.lane] : priorLanes;

  // FIT-11: an unlisted plausible word is a catalog gap — log it (anonymous, idempotent) so the
  // next build closes it fleet-wide. Never on a capped soft lane (that word IS in the fit set).
  if (lane.kind === "wrong" && item.clozed_sentence !== null) {
    const candidate = healCandidateLemma(tokens);
    if (candidate !== null) {
      await deps.healQueue.record({
        senseId: input.senseId,
        typedLemma: candidate,
        clozedSentence: item.clozed_sentence,
      });
    }
  }

  const graded = await submitDeterministicReview(input, deps, {
    tier: "cloze",
    grade: () => passed,
    promote: (state, ok) => promoteOnClozePass(state, ok),
    // FIT-9 / FIT-10: measured signals — the typo lane, and this presentation's bounce history
    // (0/[] is an honest measurement on cloze, unlike the tiers that omit the fields entirely).
    logExtras: { typoFixed: lane.kind === "typo", softBounceCount, softBounceLanes },
  });
  return { kind: "graded", ...graded };
}
