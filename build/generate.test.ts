import { describe, it, expect } from "vitest";
import { buildPrompt } from "./generate.js";
import { GENERATED_KEYS } from "./stageB.js";

const PAYLOAD = {
  gold_example: { carried: { word: "specialist" }, generated: { distractors: ["apprentice"] } },
  items: [
    { sense_id: "abandon_verb_01", word: "abandon", lemma: "abandon", part_of_speech: "verb", cefr: "B2", zipf_rank: 3100 },
  ],
};

describe("build/generate buildPrompt (docs/BUILD.md §5)", () => {
  it("§5: returns a single string joining system + user with a blank line", () => {
    const md = buildPrompt(PAYLOAD, "RULES-BODY");
    expect(typeof md).toBe("string");
    // system ends with the output contract; user begins the generate instruction — joined by "\n\n".
    expect(md).toContain("</output_contract>\n\nGenerate the GENERATED fields for each of these items:");
  });

  it("§5: inlines the rules body, the gold example, and the input items", () => {
    const md = buildPrompt(PAYLOAD, "RULES-BODY-MARKER");
    expect(md).toContain("RULES-BODY-MARKER");
    expect(md).toContain('"word": "specialist"'); // gold example inlined
    expect(md).toContain('"sense_id": "abandon_verb_01"'); // input items inlined
  });

  it("§5: the output contract lists exactly the generated keys", () => {
    const md = buildPrompt(PAYLOAD, "RULES");
    expect(md).toContain(GENERATED_KEYS.join(", "));
  });
});
