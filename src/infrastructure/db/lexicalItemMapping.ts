/**
 * Row <-> LexicalItem mapping for the `lexical_items` table (spec/12-data-model.md DM-2). The single
 * place the snake_case domain contract (`domain/lexicalItem.ts`) is translated to/from the camelCase
 * Drizzle columns, so `DrizzleCatalog` (read) and `seedLexicalItems` (write) never diverge (PRAG-3).
 * All Drizzle/SQL types stay confined to infrastructure (ARCH-1).
 */
import type { Cefr, LexicalItem } from "~/domain/lexicalItem.js";
import type { lexicalItems } from "./schema.js";

type Row = typeof lexicalItems.$inferSelect;
type Insert = typeof lexicalItems.$inferInsert;

/** LexicalItem (read-only build output) → an insert row. Carried + generated + provenance, verbatim. */
export function toLexicalRow(it: LexicalItem): Insert {
  return {
    senseId: it.sense_id,
    word: it.word,
    lemma: it.lemma,
    partOfSpeech: it.part_of_speech,
    cefr: it.cefr,
    zipf: it.zipf,
    zipfRank: it.zipf_rank,
    intendedSense: it.intended_sense,
    recognitionMeaning: it.recognition_meaning,
    distractors: it.distractors,
    clozedSentence: it.clozed_sentence,
    productiveMeaning: it.productive_meaning,
    modelSentence: it.model_sentence,
    selfReferencePrompt: it.self_reference_prompt,
    genModel: it.gen_model,
    genSpecVersion: it.gen_spec_version,
  };
}

/** A selected row → the LexicalItem the runtime consumes. `cefr` is cast back to Cefr (see schema note). */
export function fromLexicalRow(row: Row): LexicalItem {
  return {
    word: row.word,
    lemma: row.lemma,
    part_of_speech: row.partOfSpeech,
    sense_id: row.senseId,
    cefr: row.cefr as Cefr,
    zipf: row.zipf,
    zipf_rank: row.zipfRank,
    intended_sense: row.intendedSense,
    recognition_meaning: row.recognitionMeaning,
    distractors: row.distractors,
    clozed_sentence: row.clozedSentence,
    productive_meaning: row.productiveMeaning,
    model_sentence: row.modelSentence,
    self_reference_prompt: row.selfReferencePrompt,
    gen_model: row.genModel,
    gen_spec_version: row.genSpecVersion,
  };
}
