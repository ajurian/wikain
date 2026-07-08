import { describe, it, expect } from "vitest";
import { assemble, type AssembleResult } from "./stageA.js";
import type { CefrLevel } from "./constants.js";
import type { ManifestItem } from "./types.js";

/** A CSV row as `readCsv` yields it (all string cells). */
function row(word: string, pos: string, cefr: string, zipf: string, zipf_rank: string): Record<string, string> {
  return { word, pos, cefr, zipf, zipf_rank };
}

/** Flatten the per-CEFR manifests back into one list (test convenience). */
function allItems(r: AssembleResult): ManifestItem[] {
  return [...r.manifests.values()].flat();
}
function level(r: AssembleResult, cefr: CefrLevel): ManifestItem[] {
  return r.manifests.get(cefr) ?? [];
}

describe("Stage A assemble (docs/BUILD.md §3, single-source CSV)", () => {
  it("§3: carries word/lemma/pos/cefr/zipf/zipf_rank and derives sense_id `{lemma}_{pos}_01`", () => {
    const r = assemble([row("Circle", "noun", "A2", "4.37", "835")]);
    expect(allItems(r)).toHaveLength(1);
    expect(level(r, "A2")[0]).toMatchObject({
      word: "Circle",
      lemma: "circle",
      part_of_speech: "noun",
      sense_id: "circle_noun_01",
      cefr: "A2",
      zipf: 4.37,
      zipf_rank: 835,
    });
    expect(level(r, "A2")[0]!._carried_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("§3/§6: items are grouped by CEFR and each group is sorted by zipf_rank ascending (most frequent first)", () => {
    const r = assemble([
      row("rare", "adj", "B2", "3.10", "9000"),
      row("common", "adj", "B2", "5.00", "120"),
      row("mid", "adj", "B2", "4.20", "1500"),
      row("everyday", "noun", "A2", "4.90", "300"),
    ]);
    expect(level(r, "B2").map((m) => m.word)).toEqual(["common", "mid", "rare"]);
    expect(level(r, "A2").map((m) => m.word)).toEqual(["everyday"]);
    expect(level(r, "B1")).toHaveLength(0);
    expect(level(r, "C1")).toHaveLength(0);
  });

  it("§3.4: an out-of-scope POS (modalv) is quarantined, not in any manifest", () => {
    const r = assemble([
      row("need", "modalv", "B1", "6.18", "2"),
      row("badly", "adv", "A2", "4.42", "745"),
    ]);
    expect(allItems(r).map((m) => m.word)).toEqual(["badly"]);
    expect(r.quarantine).toHaveLength(1);
    expect(r.quarantine[0]).toMatchObject({ word: "need", raw_pos: "modalv", reason: "out-of-scope-pos" });
  });

  it("§3: a (lemma,pos) at two CEFR levels keeps the LOWER level and dedups to one item", () => {
    const r = assemble([
      row("race", "noun", "B1", "4.77", "295"),
      row("race", "noun", "A2", "4.77", "295"),
    ]);
    expect(allItems(r)).toHaveLength(1);
    expect(level(r, "A2")[0]!.cefr).toBe("A2");
    expect(level(r, "B1")).toHaveLength(0);
    expect(r.collisions).toEqual([{ sense_id: "race_noun_01", kept: "A2", dropped: "B1" }]);
  });

  it("§3.1: an unknown POS string HALTs (never silently bucketed)", () => {
    expect(() => assemble([row("weird", "sparkle", "B2", "3.0", "9000")])).toThrow(/\[HALT\].*unknown POS/);
  });

  it("§2.2: an invalid/empty CEFR HALTs", () => {
    expect(() => assemble([row("thing", "noun", "", "4.0", "100")])).toThrow(/\[HALT\].*CEFR/);
  });

  it("§2.2: a non-numeric zipf/zipf_rank HALTs", () => {
    expect(() => assemble([row("thing", "noun", "B1", "n/a", "100")])).toThrow(/\[HALT\].*zipf/);
  });
});
