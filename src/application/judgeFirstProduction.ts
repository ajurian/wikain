import { passesGate, type JudgeVerdict } from "../domain/verdict.js";
import {
  checkFreeProductionRuleLayer,
  type BounceResult,
  type CheckFreeProductionRuleLayerDeps,
} from "./checkFreeProductionRuleLayer.js";
import {
  JudgeUnavailableError,
  type JudgePort,
  type JudgeUnavailableReason,
} from "./ports/judge.js";

export interface JudgeFirstProductionInput {
  senseId: string;
  response: string;
  /** RL-6: how many times THIS presentation has already bounced. Defaults to 0. */
  priorBounces?: number;
}

/**
 * Only the ports needed to rule-screen + judge (SOLID-4). Deliberately has NO `cards`/`scheduler` — the
 * first-win persists nothing, so the type surface makes writing a review here impossible.
 */
export interface JudgeFirstProductionDeps extends CheckFreeProductionRuleLayerDeps {
  judge: JudgePort;
}

/**
 * A judged onboarding win: the verdict was obtained. `passed` is informational (the win screen shows on
 * ANY judged outcome — SEED-1 is a pedagogical moment, not a graded review). NO rating, NO ReviewLog,
 * NO mastery change is produced.
 */
export interface FirstProductionJudged {
  kind: "judged";
  passed: boolean;
  verdict: JudgeVerdict;
}

/** A cloud-judge transport failure (spec/08 NET-3/4/5): like a bounce it changes nothing. */
export interface FirstProductionUnavailable {
  kind: "unavailable";
  reason: JudgeUnavailableReason;
}

export type FirstProductionResult = BounceResult | FirstProductionJudged | FirstProductionUnavailable;

/**
 * The onboarding first-win (spec/09 SEED-1): reach a real judged production BEFORE any long calibration.
 * It runs the identical rule layer (RL-1..4/RL-6, reusing `checkFreeProductionRuleLayer` — one source of
 * truth, PRAG-3) then the real judge, and returns the outcome — but deliberately DOES NOT persist
 * anything: no rating (RAT-*), no ReviewLog (DM-6), no mastery change (SM-*).
 *
 * Why no persistence: the seeded words are still at `Seen` (a pre-production rung); logging a `free`
 * ReviewLog against a Seen word would leak a "usable" pass into the counter (INV-4) even though the word
 * has not graduated Seen. So the win is judged for honest feedback and records nothing — the onboarding
 * analogue of `submitFreeProduction` with the whole rate → schedule → demote → log tail removed.
 */
export async function judgeFirstProduction(
  input: JudgeFirstProductionInput,
  deps: JudgeFirstProductionDeps,
): Promise<FirstProductionResult> {
  const item = deps.catalog.get(input.senseId);
  if (item === undefined) throw new Error(`unknown sense_id: ${input.senseId}`);

  // RL-1..4/RL-6: the shared rule-layer pre-screen. A bounce is not a review (INV-2) — return it
  // unchanged; the judge is never reached.
  const rule = checkFreeProductionRuleLayer(input, deps);
  if (!rule.ok) return rule.bounce;

  // JDG-1/JDG-2: the judge runs only on a rule pass. A transport failure (spec/08) is surfaced, never
  // fabricated into a verdict — and, like a bounce, changes nothing.
  let verdict: JudgeVerdict;
  try {
    verdict = await deps.judge.judge({
      sentence: input.response,
      lemma: item.lemma,
      intendedSense: item.intended_sense,
      modelSentence: item.model_sentence,
    });
  } catch (error) {
    if (error instanceof JudgeUnavailableError) {
      return { kind: "unavailable", reason: error.reason };
    }
    throw error;
  }

  return { kind: "judged", passed: passesGate(verdict), verdict };
}
