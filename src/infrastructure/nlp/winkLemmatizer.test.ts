import { describe, it, expect } from "vitest";
import { WinkLemmatizer } from "./winkLemmatizer.js";
import { isLemmaMatch } from "../../domain/review/grading.js";

const lem = new WinkLemmatizer();

describe("TIER-5 / DM-9 en-US lemma matching (wink adapter)", () => {
  it("accepts an inflected form of the target lemma (TIER-3)", () => {
    expect(isLemmaMatch(lem.formsOf("walked"), "walk")).toBe(true);
  });

  it("accepts the bare lemma surface form", () => {
    expect(isLemmaMatch(lem.formsOf("negotiate"), "negotiate")).toBe(true);
  });

  it("accepts an American spelling (DM-9)", () => {
    expect(isLemmaMatch(lem.formsOf("organize"), "organize")).toBe(true);
  });

  it("rejects an unrelated word", () => {
    expect(isLemmaMatch(lem.formsOf("banana"), "negotiate")).toBe(false);
  });
});
