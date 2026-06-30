import { selectTier } from "../domain/tier.js";
import {
  submitCuedReview,
  type SubmitCuedReviewInput,
  type SubmitCuedReviewResult,
} from "./submitCuedReview.js";
import {
  submitFreeProduction,
  type SubmitFreeProductionDeps,
  type SubmitFreeProductionInput,
  type SubmitFreeProductionResult,
} from "./submitFreeProduction.js";

export interface RunReviewPassInput {
  userId: string;
  senseId: string;
  response: string;
  /** RAT-5 / SM-9: only the judged branch reads it; the cued branch ignores it. Defaults to false. */
  scaffolded?: boolean;
  /** RL-6: per-presentation bounce count; only the judged branch reads it. Defaults to 0. */
  priorBounces?: number;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
}

/**
 * The judged-branch deps are a structural superset of the cued-branch deps (catalog/cards/scheduler/
 * lemmatizer + analyzer/judge/tagalogLexicon), so one dependency set forwards to both use-cases.
 */
export type RunReviewPassDeps = SubmitFreeProductionDeps;

/** Which branch ran, plus that branch's own result — so the caller (UI) can render accordingly. */
export type RunReviewPassResult =
  | { tier: "cued"; outcome: SubmitCuedReviewResult }
  | { tier: "free"; outcome: SubmitFreeProductionResult };

/**
 * The end-to-end loop, one pass (spec/11-end-to-end-loop.md). This is the single entry point the
 * presentation layer calls; it composes the two existing review use-cases. It realizes:
 *  - LOOP-1: the word's mastery state selects the tier (SM-1, via `selectTier`), then the matching
 *    branch runs to completion (grade/judge → rate → persist).
 *  - LOOP-2: the deterministic (cued) branch grades and ends the pass with no LLM call.
 *  - LOOP-3: the judged (free/maintenance) branch runs the rule layer first; a bounce ends the pass
 *    with no rating and no FSRS update (INV-2). Both behaviours are owned by the dispatched
 *    use-cases — this orchestrator only routes and wraps the result.
 *  - LOOP-5: persistence happens inside the rated branch; a bounce persists nothing (INV-2).
 *
 * The card is loaded once here solely to read its mastery for routing; the dispatched use-case
 * re-loads from the same repository (no staleness in one pass), which keeps both use-cases unchanged.
 * FSRS due-word *surfacing* (LOOP-1 step 1) is out of this slice — `senseId` is taken as given.
 */
export async function runReviewPass(
  input: RunReviewPassInput,
  deps: RunReviewPassDeps,
): Promise<RunReviewPassResult> {
  const card = await deps.cards.load(input.userId, input.senseId);
  if (card === undefined) {
    throw new Error(`no card for user ${input.userId} / sense ${input.senseId}`);
  }

  // LOOP-1 step 2: mastery selects the tier (SM-1).
  const tier = selectTier(card.mastery);

  if (tier === "cued") {
    // LOOP-2: deterministic branch — no judge/LLM is reached.
    const cuedInput: SubmitCuedReviewInput = input;
    return { tier, outcome: await submitCuedReview(cuedInput, deps) };
  }

  // LOOP-3: judged branch (free production / Fluent maintenance).
  const freeInput: SubmitFreeProductionInput = input;
  return { tier, outcome: await submitFreeProduction(freeInput, deps) };
}
