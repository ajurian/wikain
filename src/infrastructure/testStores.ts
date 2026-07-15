/**
 * A full set of pglite-backed Drizzle stores sharing ONE migrated in-memory database — the test
 * substitute for the (removed) in-memory adapters. Real Postgres semantics, fully offline. Not
 * production code; imported only by `*.smoke.test.ts` / use-case tests that need a shared store.
 *
 * The global catalog is now DB-backed too (slice 21): each test DB is seeded from `build/out/items.json`
 * (the same build output prod seeds via `db:seed:catalog`), and `catalog`/`wordSource` are the real
 * Drizzle adapters over that data — so smoke tests exercise the exact production read path, not a
 * filesystem shim. `ITEMS_PATH` + the parsed `items` are exposed so a test can still pick a target word.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LexicalItem } from "~/domain/lexicalItem.js";
import { DrizzleCardRepository } from "./persistence/drizzleCardRepository.js";
import { DrizzleVerdictMemo } from "./persistence/drizzleVerdictMemo.js";
import { DrizzlePlacementMarks } from "./persistence/drizzlePlacementMarks.js";
import { DrizzlePlacementProfile } from "./persistence/drizzlePlacementProfile.js";
import { DrizzleSettings } from "./persistence/drizzleSettings.js";
import { DrizzleCatalog } from "./persistence/drizzleCatalog.js";
import { DrizzleWordSource } from "./persistence/drizzleWordSource.js";
import { FakeAnalyzer } from "./nlp/fakeAnalyzer.js";
import { seedLexicalItems } from "./db/seedCatalog.js";
import { makePgliteDb } from "./db/pglite.js";

/** repo/build/out/items.json, resolved from src/infrastructure/ (test-only; the runtime reads the DB). */
export const ITEMS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "build",
  "out",
  "items.json",
);

/** The built catalog as an array (test convenience — pick a target word without re-reading the file). */
export function loadCatalogItems(): LexicalItem[] {
  return JSON.parse(fs.readFileSync(ITEMS_PATH, "utf8")) as LexicalItem[];
}

/**
 * A fixed, lemma-free sentence for the RL-2 "target absent" bounce case. The fixture selection below
 * guarantees the chosen item's lemma is not one of these tokens, so the sentence reliably omits it.
 */
const ABSENT_SENTENCE = "The visitors gathered near the old harbor at first light.";
const ABSENT_TOKENS = new Set(ABSENT_SENTENCE.toLowerCase().match(/[a-z']+/g) ?? []);

/** A real-catalog smoke fixture: one fully-populated verb item plus the sentences the smoke tests need. */
export interface SmokeFixture {
  item: LexicalItem;
  senseId: string;
  lemma: string;
  word: string;
  /** A sentence containing the bare lemma; distinct from `model_sentence` so RL-3 verbatim-similarity
   *  does not bounce it (submitting the example itself is a degeneracy). */
  passSentence: string;
  /** A second, distinct lemma-bearing sentence (for the memo miss = a genuinely different input). */
  altSentence: string;
  /** A sentence that does NOT contain the lemma — drives the RL-2 "absent" bounce. */
  absentSentence: string;
}

/**
 * Pick a stable, fully-populated **verb** catalog item for the real-catalog smoke tests and derive
 * their sentences FROM the item, so a build-content regeneration can never re-break them. The old
 * tests hardcoded the lemma `"abandon"`, which the regenerated catalog dropped — a fixture-word
 * mismatch (not a code bug). One source of truth for the fixture (PRAG-3).
 *
 * A verb is chosen so the `to <lemma>` templates read naturally; the pass/alt sentences are
 * constructed (not the item's own `model_sentence`) because the rule layer bounces a verbatim copy
 * of the example as degenerate (RL-3). They still embed the bare lemma verbatim (RL-2 presence) and
 * carry ≥4 content tokens (RL-3 min), so the FakeJudge is reached.
 */
export function smokeFixtureItem(): SmokeFixture {
  const items = loadCatalogItems();
  const item = items.find(
    (i) =>
      i.part_of_speech === "verb" &&
      i.model_sentence !== null &&
      i.clozed_sentence !== null &&
      i.clozed_sentence.includes("_") &&
      i.recognition_meaning !== null &&
      i.productive_meaning !== null &&
      i.distractors !== null &&
      i.distractors.length === 3 &&
      !ABSENT_TOKENS.has(i.lemma.toLowerCase()),
  );
  if (!item) {
    throw new Error(
      "smokeFixtureItem: no fully-populated verb item in build/out/items.json — run `npm run combine`",
    );
  }
  return {
    item,
    senseId: item.sense_id,
    lemma: item.lemma,
    word: item.word,
    passSentence: `The whole team agreed to ${item.lemma} the difficult situation together.`,
    altSentence: `Earlier that week they had to ${item.lemma} something important again.`,
    absentSentence: ABSENT_SENTENCE,
  };
}

export async function makeTestStores() {
  const db = await makePgliteDb();
  const items = loadCatalogItems();
  await seedLexicalItems(db, items);
  return {
    db,
    items,
    cards: new DrizzleCardRepository(db),
    memo: new DrizzleVerdictMemo(db),
    marks: new DrizzlePlacementMarks(db),
    profile: new DrizzlePlacementProfile(db),
    settings: new DrizzleSettings(db),
    catalog: await DrizzleCatalog.hydrate(db),
    wordSource: new DrizzleWordSource(db),
    /**
     * The NLP port's test double. spaCy is out-of-process now, so a test that reached it would be an
     * integration test of the container rather than of the use-case under test — the same reason
     * `FakeJudge` exists. The engine's real behavior is covered in `python/src/wikain/nlp/`, and the
     * wire contract between the two in `service/main_test.py` + `nlp/httpNlp.test.ts`.
     */
    analyzer: new FakeAnalyzer(),
  };
}
