/**
 * Stage B — Generation harness (docs/BUILD.md §5, §6). The deterministic shell around generation, now
 * split by CEFR level (one manifest/pending/generated file per level in CEFR_LEVELS).
 *
 *   `npm run feed`    → for each CEFR level, selects the next BATCH_SIZE pending items (that level's
 *                       manifest minus _done.json) and writes _pending_batch_<cefr>.json
 *                       ({ gold_example, items }). `npm run generate` (build/generate.ts) then turns
 *                       each pending batch into a markdown prompt the user pastes into a frontier LLM.
 *   `npm run ingest`  → for every level with a hand-authored _generated_batch_<cefr>.json, merges
 *                       generated + carried, stamps provenance, runs Stage C, and commits each level as
 *                       its own out/batch_NNNN.json (a bad level does not block the others). Appends to
 *                       _done.json; routes flags/fails to _review.
 *
 * Resumable: a crashed/partial run never regenerates or duplicates (skips anything in _done.json).
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  BATCH_SIZE,
  CEFR_LEVELS,
  DONE_PATH,
  generatedBatchPath,
  GENERATION_RULES_PATH,
  GEN_MODEL,
  GEN_SPEC_VERSION,
  manifestPath,
  OUT_DIR,
  pendingBatchPath,
  REVIEW_PATH,
} from "./constants.js";
import { validateItem } from "./stageC.js";
import type { GeneratedFields, LexicalItem, ManifestItem } from "./types.js";

export const GENERATED_KEYS: (keyof GeneratedFields)[] = [
  "intended_sense",
  "recognition_meaning",
  "distractors",
  "clozed_sentence",
  "productive_meaning",
  "model_sentence",
  "self_reference_prompt",
];

const GOLD_EXAMPLE = {
  carried: {
    word: "specialist",
    part_of_speech: "noun",
    cefr: "B2",
    zipf_rank: 4200,
  },
  generated: {
    intended_sense:
      "A person who concentrates on and has expert knowledge or skill in one particular branch of a profession, subject, or activity.",
    recognition_meaning:
      "an expert in one particular branch of a subject or profession",
    distractors: ["apprentice", "volunteer", "candidate"],
    clozed_sentence:
      "The doctor referred her to a _ for treatment of her heart condition.",
    productive_meaning:
      "someone who focuses deeply on a single, narrow area rather than knowing a little about many things",
    model_sentence:
      "Diagnosing such a rare condition usually requires a specialist rather than a general practitioner.",
    self_reference_prompt:
      "When have you needed help from someone who focuses on just one narrow field?",
  },
};

function readJson<T>(p: string, fallback: T): T {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

/**
 * Selects the next pending batch per CEFR level and writes _pending_batch_<cefr>.json (slim payload:
 * { gold_example, items } — the markdown prompt built by `generate` carries the rules/constraints).
 * Returns how many items were fed across all levels.
 */
export function feed(): number {
  // The field-authoring rules are the single source of truth for generation; refuse to feed a
  // batch the generator can't author correctly against an empty/missing rules doc.
  if (
    !fs.existsSync(GENERATION_RULES_PATH) ||
    fs.readFileSync(GENERATION_RULES_PATH, "utf8").trim() === ""
  ) {
    throw new Error(
      `feed: empty/missing generation rules at ${GENERATION_RULES_PATH}.`,
    );
  }
  if (!CEFR_LEVELS.some((c) => fs.existsSync(manifestPath(c)))) {
    throw new Error(
      `feed: no manifests found in ${OUT_DIR}. Run \`npm run stageA\` first.`,
    );
  }

  const done = new Set(readJson<string[]>(DONE_PATH, []));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let total = 0;
  for (const cefr of CEFR_LEVELS) {
    const manifest = readJson<ManifestItem[]>(manifestPath(cefr), []);
    const pending = manifest.filter((m) => !done.has(m.sense_id));
    const batch = pending.slice(0, BATCH_SIZE);

    // Always (re)write the pending file — an empty items array signals "nothing left" to generate/ingest.
    const payload = {
      gold_example: GOLD_EXAMPLE,
      items: batch.map((m) => ({
        sense_id: m.sense_id,
        word: m.word,
        lemma: m.lemma,
        part_of_speech: m.part_of_speech,
        cefr: m.cefr,
        zipf_rank: m.zipf_rank,
      })),
    };
    fs.writeFileSync(pendingBatchPath(cefr), JSON.stringify(payload, null, 2));
    console.log(
      `feed: ${cefr} — fed ${batch.length} (${pending.length - batch.length} remain).`,
    );
    total += batch.length;
  }

  if (total === 0) {
    console.log(
      "feed: nothing pending across all levels — all items generated. Run `npm run combine`.",
    );
  } else {
    console.log(
      `feed: ${total} items across ${CEFR_LEVELS.length} levels. Run \`npm run generate\`.`,
    );
  }
  return total;
}

function nextBatchIndex(): number {
  if (!fs.existsSync(OUT_DIR)) return 0;
  const existing = fs
    .readdirSync(OUT_DIR)
    .filter((f) => /^batch_\d{4}\.json$/.test(f));
  return existing.length;
}

interface LevelResult {
  merged: LexicalItem[];
  fails: { sense_id: string; errors: string[] }[];
  flags: { sense_id: string; notes: string[] }[];
}

/**
 * Merge one level's generated batch against carried manifest facts, running Stage C per item. Carried
 * fields always come from the manifest (never the generator); a stray carried key in the generated
 * object is a hard fail (§0 single most important rule).
 */
function mergeLevel(
  pendingItems: { sense_id: string }[],
  byId: Map<string, ManifestItem>,
  generated: { items: (GeneratedFields & { sense_id: string })[] },
): LevelResult {
  const genById = new Map(generated.items.map((g) => [g.sense_id, g]));
  const merged: LexicalItem[] = [];
  const fails: LevelResult["fails"] = [];
  const flags: LevelResult["flags"] = [];

  for (const p of pendingItems) {
    const carried = byId.get(p.sense_id);
    if (!carried) {
      fails.push({
        sense_id: p.sense_id,
        errors: ["sense_id not in manifest"],
      });
      continue;
    }
    const g = genById.get(p.sense_id);
    if (!g) {
      fails.push({
        sense_id: p.sense_id,
        errors: ["no generated output for this sense_id"],
      });
      continue;
    }

    // Reject any carried key leaking into the generated object (generator must only return generated).
    const allowed = new Set<string>(["sense_id", "_flags", ...GENERATED_KEYS]);
    const stray = Object.keys(g).filter((k) => !allowed.has(k));
    if (stray.length > 0) {
      fails.push({
        sense_id: p.sense_id,
        errors: [`generated output has stray keys: ${stray.join(", ")}`],
      });
      continue;
    }

    const item: LexicalItem = {
      word: carried.word,
      lemma: carried.lemma,
      part_of_speech: carried.part_of_speech,
      sense_id: carried.sense_id,
      cefr: carried.cefr,
      zipf: carried.zipf,
      zipf_rank: carried.zipf_rank,
      intended_sense: g.intended_sense ?? null,
      recognition_meaning: g.recognition_meaning ?? null,
      distractors: g.distractors ?? null,
      clozed_sentence: g.clozed_sentence ?? null,
      productive_meaning: g.productive_meaning ?? null,
      model_sentence: g.model_sentence ?? null,
      self_reference_prompt: g.self_reference_prompt ?? null,
      ...(g._flags ? { _flags: g._flags } : {}),
      gen_model: GEN_MODEL,
      gen_spec_version: GEN_SPEC_VERSION,
    };

    const v = validateItem(item);
    if (v.fails.length > 0)
      fails.push({ sense_id: p.sense_id, errors: v.fails });
    if (v.flags.length > 0)
      flags.push({ sense_id: p.sense_id, notes: v.flags });
    merged.push(item);
  }

  return { merged, fails, flags };
}

/**
 * Ingests every CEFR level that has a hand-authored _generated_batch_<cefr>.json. Each level commits
 * independently: zero hard-fails → its own batch_NNNN.json + its sense_ids appended to _done.json; any
 * hard-fail → nothing committed for that level, recorded to _review.json (so a bad level never blocks the
 * others). Returns { committed, failed } level counts; the CLI maps failed > 0 to exit code 2.
 */
export function ingest(): { committed: number; failed: number } {
  // Carried authority: the union of all four manifests (never trust the generator for carried fields).
  const byId = new Map<string, ManifestItem>();
  for (const cefr of CEFR_LEVELS) {
    for (const m of readJson<ManifestItem[]>(manifestPath(cefr), []))
      byId.set(m.sense_id, m);
  }
  if (byId.size === 0) {
    throw new Error(
      `ingest: no manifests in ${OUT_DIR}. Run \`npm run stageA\` first.`,
    );
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const done = readJson<string[]>(DONE_PATH, []);
  const review = readJson<unknown[]>(REVIEW_PATH, []);
  let committed = 0;
  let failed = 0;
  let processed = 0;

  for (const cefr of CEFR_LEVELS) {
    const pending = readJson<{ items: { sense_id: string }[] } | null>(
      pendingBatchPath(cefr),
      null,
    );
    if (!pending || !Array.isArray(pending.items) || pending.items.length === 0)
      continue;
    if (!fs.existsSync(generatedBatchPath(cefr))) {
      console.warn(
        `ingest: ${cefr} — no ${generatedBatchPath(cefr)} yet; skipping.`,
      );
      continue;
    }
    processed += 1;

    const generated = readJson<{
      items: (GeneratedFields & { sense_id: string })[];
    }>(generatedBatchPath(cefr), { items: [] });
    const { merged, fails, flags } = mergeLevel(pending.items, byId, generated);

    // §7.1: fail the level on any hard miss — do not commit it; record for regeneration.
    if (fails.length > 0) {
      review.push({
        kind: "batch_failed",
        level: cefr,
        at: new Date().toISOString(),
        fails,
        flags,
      });
      console.error(
        `ingest: ${cefr} — ${fails.length} item(s) FAILED; level not committed. See ${REVIEW_PATH}.`,
      );
      for (const f of fails)
        console.error(`  FAIL ${f.sense_id}: ${f.errors.join("; ")}`);
      failed += 1;
      continue;
    }

    const idx = String(nextBatchIndex()).padStart(4, "0");
    const batchPath = path.join(OUT_DIR, `batch_${idx}.json`);
    fs.writeFileSync(batchPath, JSON.stringify(merged, null, 2));
    done.push(...merged.map((m) => m.sense_id));
    if (flags.length > 0) {
      review.push({
        kind: "flags",
        level: cefr,
        batch: batchPath,
        at: new Date().toISOString(),
        flags,
      });
    }
    console.log(
      `ingest: ${cefr} — committed ${merged.length} items → ${batchPath} (${flags.length} flagged).`,
    );
    committed += 1;
  }

  fs.writeFileSync(DONE_PATH, JSON.stringify(done, null, 2));
  fs.writeFileSync(REVIEW_PATH, JSON.stringify(review, null, 2));

  if (processed === 0) {
    console.log(
      "ingest: no generated batches found. Run `npm run generate`, author each " +
        "_generated_batch_<cefr>.json, then re-run `npm run ingest`.",
    );
  } else {
    console.log(
      `ingest: ${committed} level(s) committed, ${failed} failed; ${done.length} total done.`,
    );
  }
  return { committed, failed };
}

// CLI dispatch: only when invoked directly (npm run feed|ingest).
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const cmd = process.argv[2];
  if (cmd === "feed") {
    feed();
  } else if (cmd === "ingest") {
    const result = ingest();
    if (result.failed > 0) process.exit(2);
  } else {
    console.error("usage: tsx build/stageB.ts <feed|ingest>");
    process.exit(1);
  }
}
