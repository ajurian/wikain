/**
 * Single-source constants for the build pipeline. All magic values live here (mirrors the
 * spec's single-source Tunables discipline). docs/BUILD.md section references are inline.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { ControlledPos } from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "..");
export const DATA_DIR = path.join(REPO_ROOT, "data");
export const DOCS_DIR = path.join(REPO_ROOT, "docs");
export const OUT_DIR = path.join(here, "out");

/** §5 authoritative field-authoring rules — the single source of truth for generation. */
export const GENERATION_RULES_PATH = path.join(DOCS_DIR, "GENERATION_RULES.md");

/** Input files (real names — BUILD.md §2 lists `NAWL_1_2.csv`; the actual file is `NAWL_1.2.csv`). */
export const NAWL_CSV = path.join(DATA_DIR, "NAWL_1.2.csv");
export const OXFORD_3000_CSV = path.join(DATA_DIR, "american_oxford_3000_by_cefr_level.csv");
export const OXFORD_5000_CSV = path.join(DATA_DIR, "american_oxford_5000_by_cefr_level.csv");

/** Output artifacts. */
export const MANIFEST_PATH = path.join(OUT_DIR, "_manifest.json");
export const QUARANTINE_PATH = path.join(OUT_DIR, "_quarantine.json");
export const FANOUT_PATH = path.join(OUT_DIR, "_fanout.json");
export const DONE_PATH = path.join(OUT_DIR, "_done.json");
export const PENDING_BATCH_PATH = path.join(OUT_DIR, "_pending_batch.json");
export const GENERATED_BATCH_PATH = path.join(OUT_DIR, "_generated_batch.json");
export const REVIEW_PATH = path.join(OUT_DIR, "_review.json");
export const ITEMS_PATH = path.join(OUT_DIR, "items.json");

/** §6 batch size `[DEFAULT]` — confirmed 25 by the user. */
export const BATCH_SIZE = 25;

/** Provenance stamps (§4). The in-session generator is Claude Code / Opus 4.8. */
export const GEN_MODEL = "claude-opus-4-8";
export const GEN_SPEC_VERSION = "gen-spec v1";

/**
 * §3.1 POS normalization map — explicit and exhaustive over every POS string observed in the
 * three real CSVs. Any string NOT present here must HALT and flag (§3.1 / §2.2 [VALIDATE]):
 * never silently bucket as `other`, never guess a mapping. The closed-class exotics
 * (exclam/modalv/auxiliaryv/ndet/infinitivemarker/detadj) are mapped to `other` explicitly and
 * are all quarantined by the §3.4 scope filter regardless.
 */
export const POS_MAP: Readonly<Record<string, ControlledPos>> = {
  // content + common closed-class (identity)
  noun: "noun",
  verb: "verb",
  adj: "adj",
  adv: "adv",
  prep: "prep",
  pron: "pron",
  det: "det",
  conj: "conj",
  prefix: "prefix",
  // spelled-out / concatenated → controlled tag
  number: "num",
  indefinitearticle: "article",
  definitearticle: "article",
  // closed-class exotics with no dedicated controlled tag → explicit `other` (all quarantined)
  exclam: "other",
  modalv: "other",
  auxiliaryv: "other",
  ndet: "other",
  infinitivemarker: "other",
  detadj: "other",
};

/** §3.4 in-scope content POS. */
export const CONTENT_POS: ReadonlySet<ControlledPos> = new Set<ControlledPos>([
  "noun",
  "verb",
  "adj",
  "adv",
]);

/**
 * §3.4 kept NAWL function words: `(lemma, normalized-pos)` retained despite being closed-class.
 * The user chose to keep exactly these four.
 */
export const KEEP_FUNCTION_WORDS: ReadonlySet<string> = new Set<string>([
  "whoever|pron",
  "whichever|det",
  "amongst|prep",
  "minus|prep",
]);

/** §3.3 the 10 NAWL `prefix` morphemes are always quarantined (bound morphemes). */
export const NAWL_BAND_DEFAULT = "B2-C1";

/** Quarantine reason strings (stable, for auditability). */
export const QREASON = {
  NAWL_PREFIX: "nawl-prefix-morpheme",
  OUT_OF_SCOPE_POS: "out-of-scope-pos",
} as const;

export function keepKey(lemma: string, pos: ControlledPos): string {
  return `${lemma.toLowerCase()}|${pos}`;
}
