import { describe, it, expect } from "vitest";
import { resolveEdits, type EditResolution } from "./editResolution.js";
import type { Replacement } from "./verdict.js";

/**
 * spec/07-edit-resolution.md — the deterministic post-judge algorithm turning `verdict.replacements`
 * (find/replace string pairs) into character spans, with the whole-sentence corrected_sentence
 * fallback when any edit can't be uniquely located.
 */

function rep(find: string, replace: string, reason: Replacement["reason"]): Replacement {
  return { find, replace, reason };
}

describe("resolveEdits — precise-replacement edit resolution (spec/07)", () => {
  it("EDIT-3: a uniquely-matching find resolves to one [start,end] span carrying its reason", () => {
    const raw = "She go to school every day.";
    const result = resolveEdits(raw, [rep("go", "goes", "grammar")], "She goes to school every day.");

    expect(result.kind).toBe("inline");
    if (result.kind !== "inline") return;
    expect(result.edits).toHaveLength(1);
    const edit = result.edits[0]!;
    expect(raw.slice(edit.start, edit.end)).toBe("go");
    expect(edit.replace).toBe("goes");
    expect(edit.reason).toBe("grammar");
  });

  it("EDIT-4: a find with zero matches falls back to corrected_sentence (no guessed position)", () => {
    const result = resolveEdits(
      "He run fast.",
      [rep("running", "runs", "grammar")], // paraphrased, not quoted → zero matches
      "He runs fast.",
    );

    expect(result).toEqual<EditResolution>({ kind: "fallback", correctedSentence: "He runs fast." });
  });

  it("EDIT-4: a find with two matches is ambiguous and falls back to corrected_sentence", () => {
    const result = resolveEdits(
      "the cat sat on the mat",
      [rep("the", "a", "register")], // occurs twice → ambiguous
      "a cat sat on a mat",
    );

    expect(result.kind).toBe("fallback");
  });

  it("EDIT-4 (binary reading): one unresolvable edit suppresses all inline rendering", () => {
    const result = resolveEdits(
      "She go to school.",
      [
        rep("go", "goes", "grammar"), // resolvable uniquely
        rep("walk", "walks", "grammar"), // "walk" is absent → whole result falls back
      ],
      "She goes to school.",
    );

    expect(result).toEqual<EditResolution>({
      kind: "fallback",
      correctedSentence: "She goes to school.",
    });
  });

  it("EDIT-4: empty replacements is a clean inline result (no fallback)", () => {
    const result = resolveEdits("A perfectly fine sentence.", [], "A perfectly fine sentence.");
    expect(result).toEqual<EditResolution>({ kind: "inline", edits: [] });
  });

  it("EDIT-5: surviving edits are returned right-to-left (descending start)", () => {
    const raw = "He run to the shop and buy milk.";
    const result = resolveEdits(
      raw,
      [rep("run", "runs", "grammar"), rep("buy", "buys", "grammar")],
      "He runs to the shop and buys milk.",
    );

    expect(result.kind).toBe("inline");
    if (result.kind !== "inline") return;
    expect(result.edits).toHaveLength(2);
    const [later, earlier] = [result.edits[0]!, result.edits[1]!];
    // later span first (descending start) so a caller can splice without corrupting earlier offsets.
    expect(later.start).toBeGreaterThan(earlier.start);
    expect(raw.slice(later.start, later.end)).toBe("buy");
    expect(raw.slice(earlier.start, earlier.end)).toBe("run");
  });

  it("EDIT-6: overlapping edits keep the higher-priority reason (sense > grammar)", () => {
    const raw = "I make a big mistake.";
    const result = resolveEdits(
      raw,
      [
        rep("make a big mistake", "made a serious error", "sense"),
        rep("make a big", "made a huge", "grammar"), // overlaps the sense span
      ],
      "I made a serious error.",
    );

    expect(result.kind).toBe("inline");
    if (result.kind !== "inline") return;
    expect(result.edits).toHaveLength(1);
    expect(result.edits[0]!.reason).toBe("sense");
  });

  it("EDIT-2: resolution takes no gate input and returns no gate field (never adjudicates)", () => {
    // The signature is (rawSentence, replacements, correctedSentence) — nothing about the gate.
    const result = resolveEdits("He run fast.", [rep("run", "runs", "grammar")], "He runs fast.");
    expect(result.kind).toBe("inline");
    if (result.kind !== "inline") return;
    expect(result.edits[0]).not.toHaveProperty("gate");
    expect(result.edits[0]).not.toHaveProperty("passesGate");
  });
});
