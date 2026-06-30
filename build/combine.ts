/**
 * Combiner (docs/BUILD.md §6). Deterministically concatenates all out/batch_*.json arrays into
 * out/items.json (one array), last-write-wins by sense_id. Re-runnable.
 *
 * Run: `npm run combine`.
 */
import fs from "node:fs";
import path from "node:path";
import { ITEMS_PATH, OUT_DIR } from "./constants.js";
import type { LexicalItem } from "./types.js";

function main(): void {
  if (!fs.existsSync(OUT_DIR)) {
    console.error(`combine: no ${OUT_DIR}. Nothing to combine.`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(OUT_DIR)
    .filter((f) => /^batch_\d{4}\.json$/.test(f))
    .sort(); // ascending → later batches overwrite earlier on sense_id

  const byId = new Map<string, LexicalItem>();
  for (const f of files) {
    const arr = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8")) as LexicalItem[];
    for (const it of arr) byId.set(it.sense_id, it);
  }

  const items = [...byId.values()].sort((a, b) => a.sense_id.localeCompare(b.sense_id));
  fs.writeFileSync(ITEMS_PATH, JSON.stringify(items, null, 2));
  console.log(`combine: ${files.length} batch file(s) → ${items.length} items → ${ITEMS_PATH}`);
}

main();
