import type { MasteryState } from "~/domain/mastery/card.js";
import type { Replacement } from "~/domain/review/verdict.js";
import type { RuleBounceReason } from "~/domain/review/ruleLayer.js";
import type { ClozeSoftBounceLane } from "~/domain/review/clozeFitSet.js";
import type { JudgeUnavailableReason } from "../ports/judge.js";
import type { RunReviewPassResult } from "./runReviewPass.js";

/**
 * One inline edit shaped for the presentation (EDIT-7). The domain `Replacement` carries no per-edit
 * feedback — the judge returns a single `one_line_feedback` for the whole verdict (JDG-4) — so it is
 * copied onto every edit here; the UI reveals it when a span is tapped.
 */
export interface ReviewEditView {
  find: string;
  replace: string;
  reason: Replacement["reason"];
  oneLineFeedback: string;
}

/**
 * A serializable summary of one graded pass for the UI. Full FSRS state and the raw verdict stay
 * server-side; only what a screen renders crosses the wire. Discriminated by `kind` so the client
 * renders the matching state (spec/11 LOOP-2/4, spec/07 EDIT-7, spec/08 NET-3).
 */
export type ReviewOutcomeView =
  | {
      kind: "deterministic";
      tier: "recognition" | "cloze" | "cued";
      lemma: string;
      passed: boolean;
      previousMastery: MasteryState;
      mastery: MasteryState;
    }
  | {
      kind: "judged";
      tier: "free";
      lemma: string;
      passed: boolean;
      previousMastery: MasteryState;
      mastery: MasteryState;
      detectedSense: string;
      intendedSense: string;
      replacements: ReviewEditView[];
      /** EDIT-4 fallback source only — the resolver decides inline-vs-fallback. */
      correctedSentence: string;
      enrichment: string | null;
    }
  /** spec/08 NET-3/4: the judge was reached but no verdict came back (card stays due, INV-2). */
  | { kind: "unavailable"; tier: "free"; reason: JudgeUnavailableReason }
  /**
   * A rule-layer bounce (INV-2). The client normally learns of a bounce from the instant rule-check
   * (NET-2) before the judged submit, but the full pass re-runs the rule layer, so this arm keeps the
   * mapping total and defensive.
   */
  | { kind: "bounce"; tier: "free"; reason: RuleBounceReason; bounces: number; revealModelSentence: boolean }
  /**
   * FIT-7: a typed-cloze soft bounce — no rating happened; the card stays due and the client
   * re-prompts with the lane's copy. `gloss` (the item's `bounce_gloss`) ships ONLY here, on the
   * `different_sense_fit` lane — never pre-answer (FIT-4, the RL-6 ship-on-reveal pattern).
   */
  | {
      kind: "clozeSoftBounce";
      tier: "cloze";
      lane: ClozeSoftBounceLane;
      bounces: number;
      hintPrefix: string;
      gloss: string | null;
    };

/**
 * Map the use-case result to the UI view-model. Pure and framework-free (no UI copy — that lives in
 * the components); it only selects and reshapes fields. `lemma` is passed in (the caller already
 * resolved the catalog item) rather than re-fetched here.
 */
export function presentReviewOutcome(result: RunReviewPassResult, lemma: string): ReviewOutcomeView {
  const { previousMastery } = result;

  // The cloze tier's result is itself a union: FIT-7's soft bounce carries no grade to present.
  if (result.tier === "cloze") {
    const outcome = result.outcome;
    if (outcome.kind === "softBounce") {
      return {
        kind: "clozeSoftBounce",
        tier: "cloze",
        lane: outcome.lane,
        bounces: outcome.bounces,
        hintPrefix: outcome.hintPrefix,
        gloss: outcome.gloss,
      };
    }
    return {
      kind: "deterministic",
      tier: "cloze",
      lemma,
      passed: outcome.passed,
      previousMastery,
      mastery: outcome.mastery,
    };
  }

  // LOOP-2: the other deterministic tiers — pass/fail + the mastery move.
  if (result.tier !== "free") {
    return {
      kind: "deterministic",
      tier: result.tier,
      lemma,
      passed: result.outcome.passed,
      previousMastery,
      mastery: result.outcome.mastery,
    };
  }

  const outcome = result.outcome;
  switch (outcome.kind) {
    case "bounce":
      return {
        kind: "bounce",
        tier: "free",
        reason: outcome.reason,
        bounces: outcome.bounces,
        revealModelSentence: outcome.revealModelSentence,
      };
    case "unavailable":
      return { kind: "unavailable", tier: "free", reason: outcome.reason };
    case "judged": {
      const v = outcome.verdict;
      return {
        kind: "judged",
        tier: "free",
        lemma,
        passed: outcome.passed,
        previousMastery,
        mastery: outcome.mastery,
        detectedSense: v.detected_sense,
        intendedSense: v.intended_sense,
        // JDG-4: one verdict-level feedback line, shown against each edit on demand (EDIT-7).
        replacements: v.replacements.map((r) => ({
          find: r.find,
          replace: r.replace,
          reason: r.reason,
          oneLineFeedback: v.one_line_feedback,
        })),
        correctedSentence: v.corrected_sentence,
        enrichment: v.enrichment_suggestion,
      };
    }
  }
}
