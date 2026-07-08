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

/**
 * Input file (§2). A single flat CSV — header `word,pos,cefr,zipf,zipf_rank` — replacing the earlier
 * three-CSV NAWL + Oxford-3000/5000 stack. Every row carries a real CEFR (A2–C1) and a dense frequency
 * rank; there are no parentheticals, no NAWL, no A1.
 */
export const MERGED_CSV = path.join(DATA_DIR, "merged_oxford_a2c1_zipf.csv");

/**
 * The CEFR levels the source carries. Stage A emits one manifest per level (sorted by zipf_rank), and
 * feed/generate/ingest fan out over these — the generation loop is split by band so each frontier-LLM
 * prompt is level-homogeneous (§4 band-homogeneous distractors, §4.5 CEFR-aware sense).
 */
export const CEFR_LEVELS = ["A2", "B1", "B2", "C1"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** Shared, single-file output artifacts (span all levels). */
export const QUARANTINE_PATH = path.join(OUT_DIR, "_quarantine.json");
export const DONE_PATH = path.join(OUT_DIR, "_done.json");
export const REVIEW_PATH = path.join(OUT_DIR, "_review.json");
export const ITEMS_PATH = path.join(OUT_DIR, "items.json");

/** Per-CEFR-level output artifacts (§5/§6 — the loop fans out over CEFR_LEVELS). */
export const manifestPath = (cefr: CefrLevel): string =>
  path.join(OUT_DIR, `_manifest_${cefr}.json`);
export const pendingBatchPath = (cefr: CefrLevel): string =>
  path.join(OUT_DIR, `_pending_batch_${cefr}.json`);
export const generatedBatchPath = (cefr: CefrLevel): string =>
  path.join(OUT_DIR, `_generated_batch_${cefr}.json`);
/** The markdown prompt the user pastes into a frontier-LLM free chat (build/generate.ts). */
export const promptPath = (cefr: CefrLevel): string =>
  path.join(OUT_DIR, `_prompt_${cefr}.md`);

/** §6 batch size `[DEFAULT]` — confirmed 25 by the user, per CEFR level. */
export const BATCH_SIZE = 25;

/**
 * Provenance stamps (§4). Generation is now hand-authored via frontier-LLM free chats (varying models),
 * so the model stamp is a generic marker rather than a specific API model — edit it if you want to record
 * the exact model used for a run.
 */
export const GEN_MODEL = "manual-frontier-llm";
export const GEN_SPEC_VERSION = "gen-spec v3";

/**
 * §3.1 POS normalization map — explicit and exhaustive over every POS string observed in the source
 * CSV. Any string NOT present here must HALT and flag (§3.1 / §2.2 [VALIDATE]): never silently bucket
 * as `other`, never guess a mapping. The closed-class exotics (exclam/modalv/auxiliaryv/ndet/
 * infinitivemarker/detadj) are mapped to `other` explicitly and are all quarantined by the §3.4 scope
 * filter regardless (the merged CSV carries `modalv`/`auxiliaryv` — e.g. `need`, `ought`, `have`).
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

/** Quarantine reason strings (stable, for auditability). */
export const QREASON = {
  OUT_OF_SCOPE_POS: "out-of-scope-pos",
} as const;
