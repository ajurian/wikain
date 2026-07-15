import { resolveReviewTier } from "~/domain/review/reviewRouting.js";
import {
  submitCuedReview,
  type SubmitCuedReviewInput,
  type SubmitCuedReviewResult,
} from "./submitCuedReview.js";
import { submitRecognition, type SubmitRecognitionResult } from "./submitRecognition.js";
import { submitCloze, type SubmitClozeResult } from "./submitCloze.js";
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
 * analyzer/judge/tagalogLexicon), so one dependency set forwards to both use-cases.
 */
export type RunReviewPassDeps = SubmitFreeProductionDeps;

import type { MasteryState } from "~/domain/mastery/card.js";

/**
 * Which branch ran, plus that branch's own result — so the caller (UI) can render accordingly.
 * `previousMastery` is the card's mastery *before* this pass (read once here for routing), so the
 * presentation can render an honest promotion/demotion line (`from → to`) without a redundant load.
 */
export type RunReviewPassResult = { previousMastery: MasteryState } & (
  | { tier: "recognition"; outcome: SubmitRecognitionResult }
  | { tier: "cloze"; outcome: SubmitClozeResult }
  | { tier: "cued"; outcome: SubmitCuedReviewResult }
  | { tier: "free"; outcome: SubmitFreeProductionResult }
);

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

  // LOOP-1 step 2: which tier to grade at. `Seen` depends on the word's ReviewLog history (SM-3 +
  // RAT-7), so its logs are loaded; other states route on mastery alone (SM-1). One shared router
  // (`resolveReviewTier`) so this grading path and the prompt shown by `resolveReviewPrompt` agree.
  const logs =
    card.mastery === "Seen" ? await deps.cards.logsForWord(input.userId, input.senseId) : [];
  const tier = resolveReviewTier(card.mastery, logs);
  const previousMastery = card.mastery;

  switch (tier) {
    // Deterministic branches — no judge/LLM is reached (LOOP-2).
    case "recognition":
      return { tier, previousMastery, outcome: await submitRecognition(input, deps) };
    case "cloze":
      return { tier, previousMastery, outcome: await submitCloze(input, deps) };
    case "cued": {
      const cuedInput: SubmitCuedReviewInput = input;
      return { tier, previousMastery, outcome: await submitCuedReview(cuedInput, deps) };
    }
    // Judged branch (free production / Fluent maintenance) — LOOP-3.
    case "free": {
      const freeInput: SubmitFreeProductionInput = input;
      return { tier, previousMastery, outcome: await submitFreeProduction(freeInput, deps) };
    }
  }
}
