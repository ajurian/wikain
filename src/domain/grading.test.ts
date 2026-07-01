import { describe, it, expect } from "vitest";
import { isLemmaMatch, isRecognitionCorrect } from "./grading.js";

describe("TIER-5 lemma-match grading (pure rule over port-supplied forms)", () => {
  it("matches when a response form equals the target lemma (TIER-3, inflection-agnostic)", () => {
    // The Lemmatizer port emits surface + lemma forms; "negotiated" lemmatizes to "negotiate".
    expect(isLemmaMatch(["negotiated", "negotiate"], "negotiate")).toBe(true);
  });

  it("does not match an unrelated response", () => {
    expect(isLemmaMatch(["walked", "walk"], "negotiate")).toBe(false);
  });

  it("does not match an empty target lemma", () => {
    expect(isLemmaMatch(["anything"], "  ")).toBe(false);
  });
});

describe("TIER-2 recognition MCQ grading (exact identity, not lemma match)", () => {
  it("accepts the target word regardless of case/whitespace", () => {
    expect(isRecognitionCorrect(" Negotiate ", "negotiate")).toBe(true);
  });

  it("rejects a chosen distractor word", () => {
    expect(isRecognitionCorrect("bargain", "negotiate")).toBe(false);
  });

  it("rejects an inflected form — MCQ is pick-the-word, not lemma-match", () => {
    expect(isRecognitionCorrect("negotiated", "negotiate")).toBe(false);
  });
});
