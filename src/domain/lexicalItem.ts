/**
 * Runtime lexical-item consumption contract (spec/12-data-model.md DM-2). The runtime reads the
 * catalog as a READ-ONLY input and MUST NOT mutate or regenerate any field. The Python content
 * pipeline is the producer of record (docs/BUILD.md §4), and both sides assert against
 * `docs/lexical-item.contract.json` — a drift is a testable assertion (DM-12, DM-4 [FLAG]),
 * enforced by lexicalItem.test.ts here and by pipeline/types_test.py there.
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

/** FIT-1: the three cloze fit-set lanes. Exactly one `target` entry per item. */
export type ClozeFitClass = "target" | "same_sense_near_miss" | "different_sense_fit";

/**
 * One classified blank-filler (FIT-1). The build output's per-entry `why` justification is stripped
 * at ingest (FIT-3), so the consumed shape is exactly these two fields.
 */
export interface ClozeFitEntry {
  lemma: string;
  class: ClozeFitClass;
}

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
  /** DM-4: an item may carry `model_sentence: null` when the generator flagged it (§7.3); tolerate it. */
  model_sentence: string | null;
  self_reference_prompt: string | null;
  /** FIT-1: every plausible cloze blank-filler, classified. NEVER shipped to the client pre-answer. */
  cloze_fit_set: ClozeFitEntry[] | null;
  /** FIT-4: the different-sense soft-bounce meaning cue — a paraphrase of `productive_meaning`. */
  bounce_gloss: string | null;
  // --- provenance ---
  gen_model: string;
  gen_spec_version: string;
  /** FIT-5: stamped at ingest (=1); increments on heal-merge / rubric change. Null pre-generation. */
  fit_set_version: number | null;
}
