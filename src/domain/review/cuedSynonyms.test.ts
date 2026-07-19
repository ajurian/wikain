import { describe, expect, it } from "vitest";
import { resolveCuedLane } from "./cuedSynonyms.js";

/** jail/prison fixture from spec/15 CUE-1: prison/gaol are same-sense synonyms of jail. */
const SYNONYMS = ["prison", "gaol"];

function lane(
  responseForms: string[],
  responseRaw: string,
  synonyms: string[] | null = SYNONYMS,
) {
  return resolveCuedLane({ responseForms, responseRaw, targetLemma: "jail", synonyms });
}

describe("CUE-5 cued lane resolution (target → typo → synonym → wrong)", () => {
  it("resolves the target lane on an inflected form of the target (CUE-5.1 lemma match)", () => {
    expect(lane(["jailed", "jail"], "jailed")).toEqual({ kind: "target" });
  });

  it("CUE-5.1: a response within DL 1 of the target takes the typo lane (treated as a match)", () => {
    expect(lane(["jal", "jal"], "jal")).toEqual({ kind: "typo" });
  });

  it("CUE-5.2: a valid same-sense synonym resolves to the synonym (soft-bounce) lane", () => {
    expect(lane(["prison", "prison"], "prison")).toEqual({ kind: "synonym" });
  });

  it("matches a synonym via any analyzed form (inflection-agnostic)", () => {
    expect(lane(["prisons", "prison"], "prisons")).toEqual({ kind: "synonym" });
  });

  it("CUE-5.3: an unrelated word beyond the typo distance takes the wrong path", () => {
    expect(lane(["hospital", "hospital"], "hospital")).toEqual({ kind: "wrong" });
  });

  it("matches case-insensitively", () => {
    expect(lane(["Prison", "Prison"], "Prison")).toEqual({ kind: "synonym" });
  });

  it("CUE-5.1: target-pass (incl. typo) precedes the synonym lane", () => {
    // A synonym that is also within DL 1 of the target is treated as a target typo (CUE-5 order).
    expect(lane(["jai", "jai"], "jai", ["jai"])).toEqual({ kind: "typo" });
  });

  it("degrades to target/typo/wrong when the item carries no synonym set", () => {
    expect(lane(["jailed", "jail"], "jailed", null)).toEqual({ kind: "target" });
    expect(lane(["jal", "jal"], "jal", null)).toEqual({ kind: "typo" });
    expect(lane(["prison", "prison"], "prison", null)).toEqual({ kind: "wrong" });
  });

  it("treats an empty synonym set the same as none", () => {
    expect(lane(["prison", "prison"], "prison", [])).toEqual({ kind: "wrong" });
  });
});
