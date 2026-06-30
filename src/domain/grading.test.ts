import { describe, it, expect } from "vitest";
import { isLemmaMatch } from "./grading.js";

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
