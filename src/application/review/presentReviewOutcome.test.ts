import { describe, it, expect } from "vitest";
import { presentReviewOutcome } from "./presentReviewOutcome.js";
import type { RunReviewPassResult } from "./runReviewPass.js";
import type { JudgeVerdict } from "~/domain/review/verdict.js";

function verdict(overrides: Partial<JudgeVerdict> = {}): JudgeVerdict {
  return {
    used_in_target_sense: true,
    detected_sense: "to reach agreement by discussion",
    intended_sense: "to reach agreement by discussion",
    grammatical: true,
    collocation_natural: true,
    register_fit: "ok",
    replacements: [],
    corrected_sentence: "",
    enrichment_suggestion: null,
    one_line_feedback: "",
    ...overrides,
  };
}

const due = new Date("2026-07-01T00:00:00Z");

describe("presentReviewOutcome", () => {
  it("LOOP-2: a deterministic cued pass maps to a deterministic view carrying from → to mastery", () => {
    const result: RunReviewPassResult = {
      tier: "cued",
      previousMastery: "Recognized",
      outcome: { kind: "graded", passed: true, rating: "Good", mastery: "Productive", due },
    };
    const view = presentReviewOutcome(result, "negotiate");
    expect(view).toEqual({
      kind: "deterministic",
      tier: "cued",
      lemma: "negotiate",
      passed: true,
      previousMastery: "Recognized",
      mastery: "Productive",
    });
  });

  it("CUE-6: a cued synonym soft bounce maps to its own no-grade view (target withheld)", () => {
    const result: RunReviewPassResult = {
      tier: "cued",
      previousMastery: "Recognized",
      outcome: { kind: "softBounce", bounces: 1, hintPrefix: "n" },
    };
    const view = presentReviewOutcome(result, "negotiate");
    expect(view).toEqual({
      kind: "cuedSoftBounce",
      tier: "cued",
      bounces: 1,
      hintPrefix: "n",
    });
  });

  it("LOOP-4 / EDIT-7: a judged pass with a polish edit copies the verdict feedback onto each replacement", () => {
    const result: RunReviewPassResult = {
      tier: "free",
      previousMastery: "Productive",
      outcome: {
        kind: "judged",
        passed: true,
        rating: "Good",
        mastery: "Productive",
        due,
        verdict: verdict({
          collocation_natural: false,
          replacements: [{ find: "very", replace: "genuinely", reason: "collocation" }],
          corrected_sentence: "she genuinely negotiated",
          enrichment_suggestion: "You could also say: …",
          one_line_feedback: "A more precise intensifier reads more naturally.",
        }),
      },
    };
    const view = presentReviewOutcome(result, "negotiate");
    expect(view.kind).toBe("judged");
    if (view.kind === "judged") {
      expect(view.passed).toBe(true);
      expect(view.replacements).toEqual([
        {
          find: "very",
          replace: "genuinely",
          reason: "collocation",
          oneLineFeedback: "A more precise intensifier reads more naturally.",
        },
      ]);
      expect(view.enrichment).toBe("You could also say: …");
      expect(view.correctedSentence).toBe("she genuinely negotiated");
    }
  });

  it("LOOP-4: a judged sense-fail carries the demoted mastery and the sense mismatch", () => {
    const result: RunReviewPassResult = {
      tier: "free",
      previousMastery: "Productive",
      outcome: {
        kind: "judged",
        passed: false,
        rating: "Again",
        mastery: "Recognized",
        due,
        verdict: verdict({
          used_in_target_sense: false,
          detected_sense: "a different sense",
          intended_sense: "the target sense",
        }),
      },
    };
    const view = presentReviewOutcome(result, "negotiate");
    expect(view.kind).toBe("judged");
    if (view.kind === "judged") {
      expect(view.passed).toBe(false);
      expect(view.previousMastery).toBe("Productive");
      expect(view.mastery).toBe("Recognized");
      expect(view.detectedSense).toBe("a different sense");
      expect(view.intendedSense).toBe("the target sense");
    }
  });

  it("FIT-7: a cloze soft bounce maps to its own no-grade view (gloss ships only here, FIT-4)", () => {
    const result: RunReviewPassResult = {
      tier: "cloze",
      previousMastery: "Seen",
      outcome: {
        kind: "softBounce",
        lane: "different_sense_fit",
        bounces: 1,
        hintPrefix: "n",
        gloss: "to reach an agreement by talking it through",
      },
    };
    const view = presentReviewOutcome(result, "negotiate");
    expect(view).toEqual({
      kind: "clozeSoftBounce",
      tier: "cloze",
      lane: "different_sense_fit",
      bounces: 1,
      hintPrefix: "n",
      gloss: "to reach an agreement by talking it through",
    });
  });

  it("FIT-8: a graded cloze outcome (incl. the capped Again) still maps to the deterministic view", () => {
    const result: RunReviewPassResult = {
      tier: "cloze",
      previousMastery: "Seen",
      outcome: {
        kind: "graded",
        passed: false,
        rating: "Again",
        mastery: "Seen",
        due,
      },
    };
    const view = presentReviewOutcome(result, "negotiate");
    expect(view).toEqual({
      kind: "deterministic",
      tier: "cloze",
      lemma: "negotiate",
      passed: false,
      previousMastery: "Seen",
      mastery: "Seen",
    });
  });

  it("NET-3: an unavailable judge maps to an unavailable view carrying the reason", () => {
    const result: RunReviewPassResult = {
      tier: "free",
      previousMastery: "Productive",
      outcome: { kind: "unavailable", reason: "transient" },
    };
    const view = presentReviewOutcome(result, "negotiate");
    expect(view).toEqual({ kind: "unavailable", tier: "free", reason: "transient" });
  });

  it("INV-2: a rule-layer bounce maps to a bounce view (defensive — normally caught by the instant check)", () => {
    const result: RunReviewPassResult = {
      tier: "free",
      previousMastery: "Productive",
      outcome: { kind: "bounce", reason: "absent", bounces: 1, revealModelSentence: false },
    };
    const view = presentReviewOutcome(result, "negotiate");
    expect(view).toEqual({
      kind: "bounce",
      tier: "free",
      reason: "absent",
      bounces: 1,
      revealModelSentence: false,
    });
  });
});
