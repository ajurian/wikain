/**
 * Stage C — Validation (docs/BUILD.md §7.1). Deterministic auto-asserts over generated items.
 *
 * Exposed as `validateItem` (reused by Stage B `ingest`) and runnable standalone over a JSON array
 * of LexicalItems (`npm run validate -- <path>`, defaults to build/out/items.json). A `fail` means
 * the item must not ship; a `flag` means a human must eyeball it (§7.2 / §7.3) but it is not an
 * auto-reject.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import winkNLP, { type ItemToken, type ItsFunction, type WinkMethods } from "wink-nlp";
import model from "wink-eng-lite-web-model";
import { ITEMS_PATH } from "./constants.js";
import type { LexicalItem } from "./types.js";

const nlp: WinkMethods = winkNLP(model);
const its = nlp.its;

const FIRST_PERSON = new Set(["i", "i'm", "im", "my", "me", "myself"]);
const CONTENT_POS_TAGS = new Set(["NOUN", "VERB", "ADJ", "ADV", "PROPN"]);

export interface ValidationResult {
  sense_id: string;
  fails: string[];
  flags: string[];
}

/** Does `text` contain a token whose lemma (or surface form) matches `lemma`? */
function containsLemmaForm(text: string, lemma: string): boolean {
  const target = lemma.toLowerCase();
  const doc = nlp.readDoc(text);
  let found = false;
  doc.tokens().each((t: ItemToken) => {
    if (found) return;
    const normal = t.out(its.normal).toLowerCase();
    const lem = t.out(its.lemma as unknown as ItsFunction<string>).toLowerCase();
    if (normal === target || lem === target) found = true;
  });
  return found;
}

/** Content-word lemma set of `text` (lowercased), minus stop words and punctuation. */
function contentLemmas(text: string): Set<string> {
  const out = new Set<string>();
  const doc = nlp.readDoc(text);
  doc.tokens().each((t: ItemToken) => {
    if (t.out(its.type) !== "word") return;
    if (t.out(its.stopWordFlag) === true) return;
    if (!CONTENT_POS_TAGS.has(t.out(its.pos))) return;
    out.add(t.out(its.lemma as unknown as ItsFunction<string>).toLowerCase());
  });
  return out;
}

function hasFirstPerson(text: string): boolean {
  const doc = nlp.readDoc(text);
  let found = false;
  doc.tokens().each((t: ItemToken) => {
    if (found) return;
    if (FIRST_PERSON.has(t.out(its.normal).toLowerCase())) found = true;
  });
  return found;
}

function firstTokenIsVerb(text: string): boolean {
  const doc = nlp.readDoc(text);
  const first = doc.tokens().itemAt(0);
  return first !== undefined && first.out(its.pos) === "VERB";
}

export function validateItem(item: LexicalItem): ValidationResult {
  const fails: string[] = [];
  const flags: string[] = [];
  const flagged = new Set(item._flags ?? []);
  const lemma = item.lemma.toLowerCase();

  // A null generated field is only allowed when the model recorded a _flags reason (§7.3).
  const req = (name: keyof LexicalItem, value: unknown): boolean => {
    const empty = value === null || value === undefined || (typeof value === "string" && value.trim() === "");
    if (empty) {
      if (flagged.size === 0) fails.push(`${String(name)} is empty with no _flags`);
      return false;
    }
    return true;
  };

  // ---- carried-field sanity (carried/generated diff happens in ingest against the manifest) ----
  if (!item.lemma?.trim()) fails.push("lemma empty");
  if (!item.word?.trim()) fails.push("word empty");
  if (!item.part_of_speech?.trim()) fails.push("part_of_speech empty");
  if (!item.sense_id?.trim()) fails.push("sense_id empty");
  if (!(item.cefr === null || ["A1", "A2", "B1", "B2", "C1"].includes(item.cefr))) {
    fails.push(`cefr not in {A1..C1, null}: ${item.cefr}`);
  }

  // ---- distractors: exactly 3, distinct, none == word ----
  if (req("distractors", item.distractors) && item.distractors) {
    const d = item.distractors.map((x) => x.toLowerCase().trim());
    if (d.length !== 3) fails.push(`distractors length ${d.length} != 3`);
    if (new Set(d).size !== d.length) fails.push("distractors not all distinct");
    if (d.includes(item.word.toLowerCase())) fails.push("a distractor equals the target word");
  }

  // ---- clozed_sentence: exactly one "_", reads cleanly with the bare lemma ----
  if (req("clozed_sentence", item.clozed_sentence) && item.clozed_sentence) {
    const underscores = (item.clozed_sentence.match(/_/g) ?? []).length;
    if (underscores !== 1) fails.push(`clozed_sentence has ${underscores} "_" (expected 1)`);
    else {
      const filled = item.clozed_sentence.replace("_", item.lemma);
      if (/\s{2,}/.test(filled)) fails.push("cloze fill produces a double space");
      if (/\s[.,;:!?]/.test(filled)) fails.push("cloze fill produces space-before-punctuation");
    }
  }

  // ---- model_sentence: no first-person; contains a lemma form ----
  if (req("model_sentence", item.model_sentence) && item.model_sentence) {
    if (hasFirstPerson(item.model_sentence)) fails.push("model_sentence contains I/my/me/myself");
    if (!containsLemmaForm(item.model_sentence, lemma)) {
      fails.push("model_sentence does not contain a form of the lemma");
    }
  }

  // ---- self_reference_prompt: no lemma leak; question/imperative; < ~140 chars ----
  if (req("self_reference_prompt", item.self_reference_prompt) && item.self_reference_prompt) {
    const p = item.self_reference_prompt;
    if (containsLemmaForm(p, lemma)) fails.push("self_reference_prompt leaks a form of the lemma");
    if (!(p.trim().endsWith("?") || firstTokenIsVerb(p))) {
      fails.push("self_reference_prompt is not a question or imperative");
    }
    if (p.length > 140) fails.push(`self_reference_prompt length ${p.length} > 140`);
  }

  // ---- recognition_meaning vs productive_meaning: distinct, no shared content stem (flag) ----
  const rm = item.recognition_meaning;
  const pm = item.productive_meaning;
  if (req("recognition_meaning", rm) && req("productive_meaning", pm) && rm && pm) {
    if (rm.trim().toLowerCase() === pm.trim().toLowerCase()) {
      fails.push("recognition_meaning equals productive_meaning");
    }
    const shared = [...contentLemmas(rm)].filter((x) => contentLemmas(pm).has(x));
    if (shared.length > 0) flags.push(`meanings share content stem(s): ${shared.join(", ")}`);
  }

  req("intended_sense", item.intended_sense);

  return { sense_id: item.sense_id, fails, flags };
}

/** Validate a whole array; returns aggregate results. */
export function validateAll(items: LexicalItem[]): ValidationResult[] {
  // Catalog-wide: item key uniqueness (§7.1).
  const seen = new Map<string, number>();
  const results = items.map((it) => validateItem(it));
  for (const it of items) seen.set(it.sense_id, (seen.get(it.sense_id) ?? 0) + 1);
  for (const r of results) {
    if ((seen.get(r.sense_id) ?? 0) > 1) r.fails.push("duplicate sense_id in catalog");
  }
  return results;
}

function main(): void {
  const argPath = process.argv[2] ?? ITEMS_PATH;
  if (!fs.existsSync(argPath)) {
    console.error(`validate: no input at ${argPath}`);
    process.exit(1);
  }
  const items = JSON.parse(fs.readFileSync(argPath, "utf8")) as LexicalItem[];
  const results = validateAll(items);
  const failed = results.filter((r) => r.fails.length > 0);
  const flagged = results.filter((r) => r.flags.length > 0);

  console.log(`Validated ${results.length} items: ${failed.length} failing, ${flagged.length} flagged.`);
  for (const r of failed) console.log(`  FAIL ${r.sense_id}: ${r.fails.join("; ")}`);
  for (const r of flagged) console.log(`  flag ${r.sense_id}: ${r.flags.join("; ")}`);
  if (failed.length > 0) process.exit(2);
}

// Run only when invoked directly (not when imported by ingest).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
