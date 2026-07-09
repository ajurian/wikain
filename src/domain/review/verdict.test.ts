import { describe, it, expect } from "vitest";
import { passesGate, type JudgeVerdict } from "./verdict.js";

function verdict(overrides: Partial<JudgeVerdict> = {}): JudgeVerdict {
  return {
    used_in_target_sense: true,
    detected_sense: "s",
    intended_sense: "s",
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

describe("passesGate", () => {
  it("JDG-2: passes only when sense-correct AND grammatical", () => {
    expect(passesGate(verdict())).toBe(true);
    expect(passesGate(verdict({ used_in_target_sense: false }))).toBe(false);
    expect(passesGate(verdict({ grammatical: false }))).toBe(false);
  });

  it("JDG-5: advisory axes and replacements never change the gate", () => {
    const awkwardButValid = verdict({
      collocation_natural: false,
      register_fit: "off",
      replacements: [{ find: "a", replace: "b", reason: "collocation" }],
    });
    // Advisory noise on a sense-correct, grammatical sentence still passes (JDG-2/JDG-5).
    expect(passesGate(awkwardButValid)).toBe(true);

    const senseFailWithEdits = verdict({
      used_in_target_sense: false,
      replacements: [{ find: "a", replace: "b", reason: "sense" }],
    });
    // No amount of advisory replacements rescues a sense failure (JDG-5).
    expect(passesGate(senseFailWithEdits)).toBe(false);
  });
});
