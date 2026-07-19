import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LexicalItem } from "./lexicalItem.js";

/**
 * DM-12 / DM-4 [FLAG]: producer (the Python content pipeline) ↔ consumer (this runtime) schema
 * conformance. The producer now lives in another language, so the old TS-to-TS assignability check
 * is impossible; instead both sides assert against one committed contract file. That is strictly
 * stronger: assignability only caught the producer *widening*, so it never noticed that the runtime
 * declares no `_flags` — which the contract now records explicitly as producer-only.
 *
 * `FIELDS` is typed `Record<keyof LexicalItem, true>`, so the compiler already refuses a missing or
 * extra key — the runtime comparison then ties that exhaustive list to the shared contract.
 * The Python twin is `python/src/wikain/pipeline/types_test.py`.
 */
const FIELDS: Record<keyof LexicalItem, true> = {
  word: true,
  lemma: true,
  part_of_speech: true,
  sense_id: true,
  cefr: true,
  zipf: true,
  zipf_rank: true,
  intended_sense: true,
  recognition_meaning: true,
  distractors: true,
  clozed_sentence: true,
  productive_meaning: true,
  model_sentence: true,
  self_reference_prompt: true,
  cloze_fit_set: true,
  bounce_gloss: true,
  cued_valid_synonyms: true,
  gen_model: true,
  gen_spec_version: true,
  fit_set_version: true,
};

interface ItemContract {
  carried: string[];
  generated: string[];
  provenance: string[];
  producerOnly: { fields: string[] };
}

const contractPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/lexical-item.contract.json",
);

describe("DM-2 lexical-item consumption contract", () => {
  const contract = JSON.parse(fs.readFileSync(contractPath, "utf8")) as ItemContract;

  it("consumes exactly the fields the content pipeline produces for it (no schema drift)", () => {
    const expected = [
      ...contract.carried,
      ...contract.generated,
      ...contract.provenance,
    ].sort();

    expect(Object.keys(FIELDS).sort()).toEqual(expected);
  });

  it("does not consume the producer-only build annotations", () => {
    for (const field of contract.producerOnly.fields) {
      expect(Object.keys(FIELDS)).not.toContain(field);
    }
  });
});
