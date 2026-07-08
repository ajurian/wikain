/**
 * Runtime lexical-item consumption contract (spec/12-data-model.md DM-2). The runtime reads the
 * catalog (build/out/items.json) as a READ-ONLY input and MUST NOT mutate or regenerate any field.
 * The build pipeline is the producer of record (docs/BUILD.md §4); a producer/consumer schema
 * drift is a testable assertion (DM-12, DM-4 [FLAG]) — enforced by lexicalItem.test.ts.
 */

/** Controlled POS vocabulary (carried; mirrors docs/BUILD.md §3.1). */
export type ControlledPos =
  | "noun"
  | "verb"
  | "adj"
  | "adv"
  | "prep"
  | "pron"
  | "det"
  | "num"
  | "article"
  | "conj"
  | "prefix"
  | "other";

/** CEFR levels; the source CSV carries A2–C1. `A1`/`null` retained for type tolerance (DM-2). */
export type Cefr = "A1" | "A2" | "B1" | "B2" | "C1" | null;

/** A merged catalog item the runtime consumes (DM-2). Every field is read-only at runtime. */
export interface LexicalItem {
  // --- carried (build Stage A) ---
  word: string;
  lemma: string;
  part_of_speech: ControlledPos;
  sense_id: string;
  cefr: Cefr;
  /** Zipf frequency (SUBTLEX-scale) — higher = more frequent. */
  zipf: number;
  /** Dense frequency rank — 1 = most frequent. */
  zipf_rank: number;
  // --- generated (build Stage B) ---
  intended_sense: string | null;
  recognition_meaning: string | null;
  distractors: string[] | null;
  clozed_sentence: string | null;
  productive_meaning: string | null;
  /** DM-4: some items carry `model_sentence: null` (wink en-US normalization); tolerate it. */
  model_sentence: string | null;
  self_reference_prompt: string | null;
  // --- provenance ---
  gen_model: string;
  gen_spec_version: string;
}
