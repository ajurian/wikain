/**
 * A minimal LexicalItem factory for the catalog contract suites. Fills every field with a valid default
 * so a test states only what it cares about (sense_id / cefr / zipf_rank / lemma). Not production code;
 * imported only by `*Contract.ts` / `*.test.ts`.
 */
import type { LexicalItem } from "../domain/lexicalItem.js";

export function makeLexicalItem(patch: Partial<LexicalItem> = {}): LexicalItem {
  const senseId = patch.sense_id ?? "word_noun_01";
  return {
    word: "word",
    lemma: "word",
    part_of_speech: "noun",
    sense_id: senseId,
    cefr: "B2",
    zipf: 4.0,
    zipf_rank: 1000,
    intended_sense: "the intended sense",
    recognition_meaning: "a unit of language",
    distractors: ["alpha", "beta", "gamma"],
    clozed_sentence: "Say the _ aloud.",
    productive_meaning: "a spoken or written unit",
    model_sentence: "Say the word aloud.",
    self_reference_prompt: "What did you just read?",
    gen_model: "manual-frontier-llm",
    gen_spec_version: "gen-spec v3",
    ...patch,
  };
}
