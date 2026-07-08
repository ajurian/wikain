/**
 * Stage B — Prompt builder (docs/BUILD.md §5). NO API. Turns each per-CEFR pending batch into a single
 * markdown prompt the user pastes into a frontier-LLM free chat; the user then hand-authors the returned
 * JSON into _generated_batch_<cefr>.json.
 *
 *   `npm run generate` — for each level, read _pending_batch_<cefr>.json (written by `feed`), build the
 *   prompt from the authoritative field-authoring rules (docs/GENERATION_RULES.md, inlined) + the gold
 *   one-shot + the code-enforced Stage C constraints, and write it to _prompt_<cefr>.md. Then paste each
 *   markdown into a frontier LLM, save the result to _generated_batch_<cefr>.json, and run `npm run ingest`.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  CEFR_LEVELS,
  GENERATION_RULES_PATH,
  OUT_DIR,
  pendingBatchPath,
  promptPath,
} from "./constants.js";
import { GENERATED_KEYS } from "./stageB.js";

interface PendingItem {
  sense_id: string;
  word: string;
  lemma: string;
  part_of_speech: string;
  cefr: string;
  zipf_rank: number;
}

interface PendingPayload {
  gold_example: unknown;
  items: PendingItem[];
}

/**
 * The code-enforced Stage C mechanics (build/stageC.ts). GENERATION_RULES.md governs *content*; these
 * are the hard asserts that fail a batch, restated so the model hits them on the first try.
 */
const HARD_CONSTRAINTS = `<constraints>
a batch is rejected if any is violated:
- model_sentence: embed the bare lemma surface form verbatim; NO first-person tokens (I, I'm, im, my, me, myself).
- self_reference_prompt: contains NO token whose lemma equals the target lemma; ends with "?" (or starts with a verb); < 140 chars.
- clozed_sentence: exactly one "_"; reads cleanly and grammatically when the bare lemma is substituted (no double space, no space before punctuation).
- distractors: exactly 3, all distinct, none equal to the target word (case-insensitive).
- recognition_meaning vs productive_meaning: never identical and share no content-word lemma (watch generic words and comparatives — "better"/"stronger" lemmatize to "good"/"strong").
- Return ONLY generated fields — never echo carried fields (word, lemma, cefr, part_of_speech, zipf_rank).
- If a rule genuinely cannot be met for an item, set that field to null and add "_flags": ["reason"] — do NOT force it.
</constraints>`;

function readJson<T>(p: string, fallback: T): T {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

/**
 * Build the full prompt for one pending batch as a single string (system + "\n\n" + user). The prompt
 * text is intentionally preserved byte-for-byte — only the return shape differs from a chat message array
 * so it can be written to a markdown file and pasted into a free chat.
 */
export function buildPrompt(payload: PendingPayload, rules: string): string {
  const outputContract =
    `<output_contract>\nReturn a JSON object of the form {"items": [ ... ]}. Each element must have "sense_id" plus ` +
    `exactly these keys: ${GENERATED_KEYS.join(", ")} (and optional "_flags"). Produce one element ` +
    `for every input item, in the same order.\n</output_contract>`;

  const system =
    "<system_intructions>\nYou author vocabulary-learning content. Locale: en-US. Follow the field-authoring rules below " +
    "EXACTLY — they are the single source of truth for every field's content and quality, distractors " +
    "especially.\n</system_intructions>\n\n" +
    "=== FIELD-AUTHORING RULES (docs/GENERATION_RULES.md) ===\n" +
    "<rules>\n" +
    rules +
    "</rules>" +
    "\n\n=== GOLD EXAMPLE (one item) ===\n" +
    "<gold_example>\n" +
    JSON.stringify(payload.gold_example, null, 2) +
    "\n</gold_example>" +
    "\n\n=== HARD CONSTRAINTS ===\n" +
    HARD_CONSTRAINTS +
    "\n\n=== OUTPUT ===\n" +
    outputContract;

  const user =
    "Generate the GENERATED fields for each of these items:\n\n<input_dataset>\n" +
    JSON.stringify(payload.items, null, 2) +
    "\n</input_dataset>";

  return `${system}\n\n${user}`;
}

/** Reads each per-CEFR pending batch and writes its markdown prompt. Returns the number of prompts written. */
export function generate(): number {
  if (
    !fs.existsSync(GENERATION_RULES_PATH) ||
    fs.readFileSync(GENERATION_RULES_PATH, "utf8").trim() === ""
  ) {
    throw new Error(
      `generate: empty/missing generation rules at ${GENERATION_RULES_PATH}.`,
    );
  }
  const rules = fs.readFileSync(GENERATION_RULES_PATH, "utf8");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let written = 0;
  for (const cefr of CEFR_LEVELS) {
    const payload = readJson<PendingPayload | null>(
      pendingBatchPath(cefr),
      null,
    );
    if (
      !payload ||
      !Array.isArray(payload.items) ||
      payload.items.length === 0
    ) {
      console.warn(`generate: ${cefr} — no pending items; skipping.`);
      continue;
    }
    const md = buildPrompt(payload, rules);
    fs.writeFileSync(promptPath(cefr), md);
    console.log(
      `generate: ${cefr} — ${payload.items.length} items → ${promptPath(cefr)}`,
    );
    written += 1;
  }

  if (written === 0) {
    console.log("generate: nothing to prompt. Run `npm run feed` first.");
  } else {
    console.log(
      "generate: paste each _prompt_<cefr>.md into a frontier LLM, save the result to " +
        "_generated_batch_<cefr>.json, then run `npm run ingest`.",
    );
  }
  return written;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    generate();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
