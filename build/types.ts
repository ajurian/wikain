/**
 * Shared schema for the Wikain build-time content pipeline (docs/BUILD.md §4).
 *
 * CARRIED fields are facts from the source CSV. Stage A fills them; Stage B (generation)
 * MUST NOT touch them (§0, §8). GENERATED fields are produced in Stage B by a frontier LLM (manual,
 * via the markdown prompt build/generate.ts writes). These types are the lexical-item contract the v4
 * runtime consumes (mirrored by src/domain/lexicalItem.ts; drift is caught by lexicalItem.test.ts).
 */

/** §3.1 controlled POS vocabulary. */
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

/** CEFR levels; the source CSV carries A2–C1. `A1`/`null` retained for runtime-type tolerance (§8 #2). */
export type Cefr = "A1" | "A2" | "B1" | "B2" | "C1" | null;

/** Carried fields — facts from the source CSV (Stage A). */
export interface CarriedFields {
  /** Display form. */
  word: string;
  /** §5.2.1 presence-gate key (lowercased `word`; no parentheticals in the source). */
  lemma: string;
  part_of_speech: ControlledPos;
  /** `{lemma}_{pos}_01` — unique item key. */
  sense_id: string;
  /** From the CSV verbatim (A2–C1). Never invented. */
  cefr: Cefr;
  /** Zipf frequency (SUBTLEX-scale) from the CSV verbatim — higher = more frequent. */
  zipf: number;
  /** Dense frequency rank from the CSV verbatim — 1 = most frequent. */
  zipf_rank: number;
}

/** Generated fields — produced in Stage B (§5). */
export interface GeneratedFields {
  intended_sense: string | null;
  recognition_meaning: string | null;
  distractors: string[] | null;
  clozed_sentence: string | null;
  productive_meaning: string | null;
  model_sentence: string | null;
  self_reference_prompt: string | null;
  /** Set by the generator when a rule could not be satisfied (§5.2, §7.3). */
  _flags?: string[];
}

export interface Provenance {
  gen_model: string;
  gen_spec_version: string;
}

/** A fully-merged runtime lexical item (carried + generated + provenance). */
export type LexicalItem = CarriedFields & GeneratedFields & Provenance;

/**
 * A manifest item: carried fields only, plus a hash so `ingest` can prove Stage B did not
 * mutate any carried value (§0 single most important rule).
 */
export interface ManifestItem extends CarriedFields {
  /** Stable hash of the carried fields, computed at Stage A. */
  _carried_hash: string;
}

export interface QuarantineEntry {
  word: string;
  lemma: string;
  part_of_speech: string;
  /** Original, pre-normalization POS string from the source. */
  raw_pos: string;
  cefr: Cefr;
  zipf: number;
  zipf_rank: number;
  reason: string;
}
