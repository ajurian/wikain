/**
 * Stage B — Generation harness (docs/BUILD.md §5, §6). The deterministic shell around the
 * in-session generator (Claude Code / Opus 4.8). It does NOT call any external API.
 *
 *   `npm run feed`    → selects the next BATCH_SIZE pending items (manifest minus _done.json) and
 *                       writes _pending_batch.json (carried fields + §5.2 prompt context + §5.1
 *                       gold one-shot). The in-session generator then writes _generated_batch.json.
 *   `npm run ingest`  → merges generated + carried, stamps provenance, runs Stage C auto-asserts,
 *                       writes out/batch_NNNN.json, appends to _done.json, routes flags to _review.
 *
 * Resumable: a crashed run never regenerates or duplicates (skips anything in _done.json).
 */
import fs from "node:fs";
import path from "node:path";
import {
  BATCH_SIZE,
  DONE_PATH,
  GENERATED_BATCH_PATH,
  GENERATION_RULES_PATH,
  GEN_MODEL,
  GEN_SPEC_VERSION,
  MANIFEST_PATH,
  OUT_DIR,
  PENDING_BATCH_PATH,
  REVIEW_PATH,
} from "./constants.js";
import { validateItem } from "./stageC.js";
import type { GeneratedFields, LexicalItem, ManifestItem } from "./types.js";

const GENERATED_KEYS: (keyof GeneratedFields)[] = [
  "intended_sense",
  "recognition_meaning",
  "distractors",
  "clozed_sentence",
  "productive_meaning",
  "model_sentence",
  "self_reference_prompt",
];

const GOLD_EXAMPLE = {
  carried: { word: "specialist", part_of_speech: "noun", sense_hint: null, band: "B2" },
  generated: {
    intended_sense:
      "A person who concentrates on and has expert knowledge or skill in one particular branch of a profession, subject, or activity.",
    recognition_meaning: "an expert in one particular branch of a subject or profession",
    distractors: ["apprentice", "volunteer", "candidate"],
    clozed_sentence: "The doctor referred her to a _ for treatment of her heart condition.",
    productive_meaning:
      "someone who focuses deeply on a single, narrow area rather than knowing a little about many things",
    model_sentence:
      "Diagnosing such a rare condition usually requires a specialist rather than a general practitioner.",
    self_reference_prompt: "When have you needed help from someone who focuses on just one narrow field?",
  },
};

function readJson<T>(p: string, fallback: T): T {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function feed(): void {
  const manifest = readJson<ManifestItem[]>(MANIFEST_PATH, []);
  if (manifest.length === 0) {
    console.error(`feed: empty/missing manifest at ${MANIFEST_PATH}. Run Stage A first.`);
    process.exit(1);
  }
  // The field-authoring rules are the single source of truth for generation; refuse to feed a
  // batch the generator can't author correctly against an empty/missing rules doc.
  if (!fs.existsSync(GENERATION_RULES_PATH) || fs.readFileSync(GENERATION_RULES_PATH, "utf8").trim() === "") {
    console.error(`feed: empty/missing generation rules at ${GENERATION_RULES_PATH}.`);
    process.exit(1);
  }
  const done = new Set(readJson<string[]>(DONE_PATH, []));
  const pending = manifest.filter((m) => !done.has(m.sense_id));
  const batch = pending.slice(0, BATCH_SIZE);

  if (batch.length === 0) {
    console.log("feed: nothing pending — all items generated. Run `npm run combine`.");
    return;
  }

  const payload = {
    instructions:
      "You (the in-session generator) produce the GENERATED fields for each item below. " +
      "BEFORE generating, READ the authoritative field-authoring rules at the path in `rules_doc` " +
      "(docs/GENERATION_RULES.md) — it is the single source of truth for every field's content and " +
      "quality, distractors especially. Locale: en-US. If a rule genuinely cannot be satisfied for an " +
      'item, set that field to null and add "_flags": ["reason"] — do NOT force it (BUILD.md §7.3). ' +
      `Write a JSON array to ${GENERATED_BATCH_PATH}; each element must have "sense_id" plus exactly ` +
      `these keys: ${GENERATED_KEYS.join(", ")} (and optional "_flags"). Return ONLY the generated fields.`,
    rules_doc: GENERATION_RULES_PATH,
    gold_example: GOLD_EXAMPLE,
    batch_size: batch.length,
    remaining_after_batch: pending.length - batch.length,
    items: batch.map((m) => ({
      sense_id: m.sense_id,
      word: m.word,
      lemma: m.lemma,
      part_of_speech: m.part_of_speech,
      sense_hint: m.sense_hint,
      band: m.band,
    })),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(PENDING_BATCH_PATH, JSON.stringify(payload, null, 2));
  console.log(
    `feed: wrote ${batch.length} items to ${PENDING_BATCH_PATH} ` +
      `(${pending.length - batch.length} will remain). Generate, then run \`npm run ingest\`.`,
  );
}

function nextBatchIndex(): number {
  if (!fs.existsSync(OUT_DIR)) return 0;
  const existing = fs.readdirSync(OUT_DIR).filter((f) => /^batch_\d{4}\.json$/.test(f));
  return existing.length;
}

function ingest(): void {
  const pending = readJson<{ items: ManifestItem[] } | null>(PENDING_BATCH_PATH, null);
  if (!pending) {
    console.error(`ingest: no ${PENDING_BATCH_PATH}. Run \`npm run feed\` first.`);
    process.exit(1);
  }
  // Re-load carried fields from the manifest (authoritative — never trust generator for carried).
  const manifest = readJson<ManifestItem[]>(MANIFEST_PATH, []);
  const byId = new Map(manifest.map((m) => [m.sense_id, m]));
  const generated = readJson<(GeneratedFields & { sense_id: string })[]>(GENERATED_BATCH_PATH, []);
  const genById = new Map(generated.map((g) => [g.sense_id, g]));

  const merged: LexicalItem[] = [];
  const fails: { sense_id: string; errors: string[] }[] = [];
  const flags: { sense_id: string; notes: string[] }[] = [];

  for (const p of pending.items) {
    const carried = byId.get(p.sense_id);
    if (!carried) {
      fails.push({ sense_id: p.sense_id, errors: ["sense_id not in manifest"] });
      continue;
    }
    const g = genById.get(p.sense_id);
    if (!g) {
      fails.push({ sense_id: p.sense_id, errors: ["no generated output for this sense_id"] });
      continue;
    }

    // Reject any carried key leaking into the generated object (generator must only return generated).
    const allowed = new Set<string>(["sense_id", "_flags", ...GENERATED_KEYS]);
    const stray = Object.keys(g).filter((k) => !allowed.has(k));
    if (stray.length > 0) {
      fails.push({ sense_id: p.sense_id, errors: [`generated output has stray keys: ${stray.join(", ")}`] });
      continue;
    }

    const item: LexicalItem = {
      word: carried.word,
      lemma: carried.lemma,
      part_of_speech: carried.part_of_speech,
      sense_id: carried.sense_id,
      sense_hint: carried.sense_hint,
      cefr: carried.cefr,
      list_rank: carried.list_rank,
      band: carried.band,
      source: carried.source,
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
    if (v.fails.length > 0) fails.push({ sense_id: p.sense_id, errors: v.fails });
    if (v.flags.length > 0) flags.push({ sense_id: p.sense_id, notes: v.flags });
    merged.push(item);
  }

  // §7.1: fail the batch on any hard miss — do not commit it; record for regeneration.
  if (fails.length > 0) {
    const review = readJson<unknown[]>(REVIEW_PATH, []);
    review.push({ kind: "batch_failed", at: new Date().toISOString(), fails, flags });
    fs.writeFileSync(REVIEW_PATH, JSON.stringify(review, null, 2));
    console.error(`ingest: ${fails.length} item(s) FAILED — batch not committed. See ${REVIEW_PATH}.`);
    for (const f of fails) console.error(`  FAIL ${f.sense_id}: ${f.errors.join("; ")}`);
    process.exit(2);
  }

  // Commit the batch.
  const idx = String(nextBatchIndex()).padStart(4, "0");
  const batchPath = path.join(OUT_DIR, `batch_${idx}.json`);
  fs.writeFileSync(batchPath, JSON.stringify(merged, null, 2));

  const done = readJson<string[]>(DONE_PATH, []);
  done.push(...merged.map((m) => m.sense_id));
  fs.writeFileSync(DONE_PATH, JSON.stringify(done, null, 2));

  if (flags.length > 0) {
    const review = readJson<unknown[]>(REVIEW_PATH, []);
    review.push({ kind: "flags", batch: batchPath, at: new Date().toISOString(), flags });
    fs.writeFileSync(REVIEW_PATH, JSON.stringify(review, null, 2));
  }

  console.log(
    `ingest: committed ${merged.length} items → ${batchPath}; ` +
      `${flags.length} flagged for human spot-check; ${done.length} total done.`,
  );
}

const cmd = process.argv[2];
if (cmd === "feed") feed();
else if (cmd === "ingest") ingest();
else {
  console.error("usage: tsx build/stageB.ts <feed|ingest>");
  process.exit(1);
}
