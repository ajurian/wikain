/**
 * Shared schema for the Wikain build-time content pipeline (docs/BUILD.md §4).
 *
 * CARRIED fields are facts from the source CSVs. Stage A fills them; Stage B (generation)
 * MUST NOT touch them (§0, §8). GENERATED fields are produced by the in-session generator
 * (Claude Code / Opus 4.8) in Stage B. These types are intended to be reused by the eventual
 * Electron runtime as the lexical-item contract.
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

/** CEFR levels present in the Oxford CSVs; `null` for NAWL-only items (never invented — §8 #2). */
export type Cefr = "A1" | "A2" | "B1" | "B2" | "C1" | null;

export type ItemSource = "oxford" | "nawl" | "both";

/** Carried fields — facts from the source CSVs (Stage A). */
export interface CarriedFields {
  /** Display form. */
  word: string;
  /** §5.2.1 presence-gate key (kept distinct from `word` by decision). */
  lemma: string;
  part_of_speech: ControlledPos;
  /** `{lemma}_{pos}_{slug(sense_hint||"01")}` — unique item key. */
  sense_id: string;
  /** Oxford parenthetical sense disambiguator, or null. */
  sense_hint: string | null;
  /** From the Oxford CSV verbatim; null for NAWL-only. Never invented. */
  cefr: Cefr;
  /** From NAWL verbatim; null for Oxford-only. */
  list_rank: number | null;
  /** Coarse cold-start band (§3.6): Oxford/both → cefr; NAWL-only → "B2-C1". */
  band: string;
  source: ItemSource;
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
  source: "oxford" | "nawl";
  cefr: Cefr;
  list_rank: number | null;
  reason: string;
}

/** Records a NAWL (lemma,pos) whose list_rank fanned out onto multiple Oxford senses (§3.5). */
export interface FanoutRecord {
  lemma: string;
  part_of_speech: ControlledPos;
  list_rank: number;
  sense_ids: string[];
}
