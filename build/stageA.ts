/**
 * Stage A — Assembly (docs/BUILD.md §3). Deterministic, NO LLM.
 *
 * Converts the three source CSVs into an assembled manifest (carried fields only) + a quarantine
 * side-file, then prints the Stage A exit-gate summary. Nothing here generates content; nothing
 * here invents a carried fact (§0, §8).
 *
 * Run: `npm run stageA`.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import {
  CONTENT_POS,
  FANOUT_PATH,
  KEEP_FUNCTION_WORDS,
  MANIFEST_PATH,
  NAWL_BAND_DEFAULT,
  NAWL_CSV,
  OUT_DIR,
  OXFORD_3000_CSV,
  OXFORD_5000_CSV,
  POS_MAP,
  QREASON,
  QUARANTINE_PATH,
  keepKey,
} from "./constants.js";
import { readCsv } from "./csv.js";
import type {
  Cefr,
  ControlledPos,
  FanoutRecord,
  ItemSource,
  ManifestItem,
  QuarantineEntry,
} from "./types.js";

const VALID_CEFR = new Set(["A1", "A2", "B1", "B2", "C1"]);

/** §3.1 — normalize a raw POS string; halt (throw) on anything not in the explicit map. */
function normalizePos(rawPos: string, context: string): ControlledPos {
  const mapped = POS_MAP[rawPos];
  if (mapped === undefined) {
    throw new Error(
      `[HALT] §3.1 unknown POS string "${rawPos}" (${context}). The normalization map does not ` +
        `cover it. Per §3.1/§2.2 [VALIDATE]: do NOT guess — extend POS_MAP after human review.`,
    );
  }
  return mapped;
}

/** §3.2 — slugify a sense hint for the sense_id. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** §3.2 — split an Oxford raw word into lemma + sense_hint + sense_id. */
function splitSense(rawWord: string, pos: ControlledPos): {
  lemma: string;
  word: string;
  sense_hint: string | null;
  sense_id: string;
} {
  const open = rawWord.indexOf("(");
  if (open === -1) {
    const lemma = rawWord.trim();
    return { lemma, word: lemma, sense_hint: null, sense_id: `${lemma.toLowerCase()}_${pos}_01` };
  }
  const close = rawWord.indexOf(")", open);
  const lemma = rawWord.slice(0, open).trim();
  const hint = rawWord.slice(open + 1, close === -1 ? undefined : close).trim();
  return {
    lemma,
    word: lemma,
    sense_hint: hint || null,
    sense_id: `${lemma.toLowerCase()}_${pos}_${slug(hint || "01")}`,
  };
}

/** §3.4 — is this (pos, lemma) in scope? */
function inScope(pos: ControlledPos, lemma: string): boolean {
  return CONTENT_POS.has(pos) || KEEP_FUNCTION_WORDS.has(keepKey(lemma, pos));
}

/** Canonical hash of the carried fields, so Stage B mutation can be detected (§0). */
function carriedHash(it: Omit<ManifestItem, "_carried_hash">): string {
  const canonical = JSON.stringify([
    it.word,
    it.lemma,
    it.part_of_speech,
    it.sense_id,
    it.sense_hint,
    it.cefr,
    it.list_rank,
    it.band,
    it.source,
  ]);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

interface OxfordRow {
  rawWord: string;
  rawPos: string;
  pos: ControlledPos;
  cefr: Cefr;
  lemma: string;
  word: string;
  sense_hint: string | null;
  sense_id: string;
  fromFile: string;
}

function main(): void {
  const quarantine: QuarantineEntry[] = [];

  // ---- Parse Oxford (both files; 3000 first so it wins sense_id collisions = lower CEFR) ----
  const oxfordInScope = new Map<string, OxfordRow>(); // keyed by sense_id
  const oxfordCollisions: { sense_id: string; kept: string; dropped: string }[] = [];

  for (const [file, label] of [
    [OXFORD_3000_CSV, "oxford-3000"],
    [OXFORD_5000_CSV, "oxford-5000"],
  ] as const) {
    const { rows } = readCsv(file);
    for (const r of rows) {
      const rawWord = r.word!;
      const rawPos = r.pos!;
      const cefrRaw = r.cefr ?? "";
      const pos = normalizePos(rawPos, `${label} word="${rawWord}"`);
      const { lemma, word, sense_hint, sense_id } = splitSense(rawWord, pos);
      const cefr: Cefr = VALID_CEFR.has(cefrRaw) ? (cefrRaw as Cefr) : null;
      if (cefr === null) {
        throw new Error(`[HALT] ${label} word="${rawWord}" has invalid CEFR "${cefrRaw}".`);
      }

      if (!inScope(pos, lemma)) {
        quarantine.push({
          word,
          lemma,
          part_of_speech: pos,
          raw_pos: rawPos,
          source: "oxford",
          cefr,
          list_rank: null,
          reason: QREASON.OUT_OF_SCOPE_POS,
        });
        continue;
      }

      const existing = oxfordInScope.get(sense_id);
      if (existing) {
        // 3000/5000 (or intra-file) collision on sense_id — keep first (lower CEFR), flag it.
        oxfordCollisions.push({
          sense_id,
          kept: `${existing.fromFile}:${existing.cefr}`,
          dropped: `${label}:${cefr}`,
        });
        continue;
      }
      oxfordInScope.set(sense_id, {
        rawWord,
        rawPos,
        pos,
        cefr,
        lemma,
        word,
        sense_hint,
        sense_id,
        fromFile: label,
      });
    }
  }

  // Index Oxford in-scope senses by (lemma,pos) for NAWL merge / fan-out.
  const oxfordByLemmaPos = new Map<string, OxfordRow[]>();
  for (const ox of oxfordInScope.values()) {
    const k = keepKey(ox.lemma, ox.pos);
    (oxfordByLemmaPos.get(k) ?? oxfordByLemmaPos.set(k, []).get(k)!).push(ox);
  }

  // ---- Parse NAWL, merge ranks into Oxford, collect NAWL-only items ----
  const rankByLemmaPos = new Map<string, number>(); // for source="both" / nawl-only
  const fanout: FanoutRecord[] = [];
  const nawlOnly: ManifestItem[] = [];

  const { rows: nawlRows } = readCsv(NAWL_CSV);
  for (const r of nawlRows) {
    const lemma = r.word!.trim();
    const rawPos = r.pos!;
    const rank = Number(r.rank!);
    const pos = normalizePos(rawPos, `nawl rank=${r.rank} word="${lemma}"`);

    // §3.3 — the 10 NAWL prefix morphemes are always quarantined (bound morphemes).
    if (pos === "prefix") {
      quarantine.push({
        word: lemma,
        lemma,
        part_of_speech: pos,
        raw_pos: rawPos,
        source: "nawl",
        cefr: null,
        list_rank: rank,
        reason: QREASON.NAWL_PREFIX,
      });
      continue;
    }

    if (!inScope(pos, lemma)) {
      quarantine.push({
        word: lemma,
        lemma,
        part_of_speech: pos,
        raw_pos: rawPos,
        source: "nawl",
        cefr: null,
        list_rank: rank,
        reason: QREASON.OUT_OF_SCOPE_POS,
      });
      continue;
    }

    const k = keepKey(lemma, pos);
    rankByLemmaPos.set(k, rank);

    const matchedSenses = oxfordByLemmaPos.get(k);
    if (matchedSenses && matchedSenses.length > 0) {
      // §3.5 — attach the same list_rank to EVERY matched sense; record fan-out if >1.
      if (matchedSenses.length > 1) {
        fanout.push({
          lemma,
          part_of_speech: pos,
          list_rank: rank,
          sense_ids: matchedSenses.map((s) => s.sense_id),
        });
      }
      // rank applied below when building manifest from oxfordInScope.
    } else {
      // NAWL-only item.
      const base = {
        word: lemma,
        lemma,
        part_of_speech: pos,
        sense_id: `${lemma.toLowerCase()}_${pos}_01`,
        sense_hint: null,
        cefr: null as Cefr,
        list_rank: rank,
        band: NAWL_BAND_DEFAULT,
        source: "nawl" as ItemSource,
      };
      nawlOnly.push({ ...base, _carried_hash: carriedHash(base) });
    }
  }

  // ---- Build the manifest: Oxford senses (with merged ranks) + NAWL-only items ----
  const manifest: ManifestItem[] = [];
  for (const ox of oxfordInScope.values()) {
    const k = keepKey(ox.lemma, ox.pos);
    const rank = rankByLemmaPos.get(k);
    const source: ItemSource = rank !== undefined ? "both" : "oxford";
    const base = {
      word: ox.word,
      lemma: ox.lemma,
      part_of_speech: ox.pos,
      sense_id: ox.sense_id,
      sense_hint: ox.sense_hint,
      cefr: ox.cefr,
      list_rank: rank ?? null,
      band: ox.cefr ?? NAWL_BAND_DEFAULT, // §3.6: Oxford/both → band = cefr
      source,
    };
    manifest.push({ ...base, _carried_hash: carriedHash(base) });
  }
  manifest.push(...nawlOnly);

  // ---- Integrity: sense_id must be unique across the whole manifest ----
  const seen = new Set<string>();
  for (const it of manifest) {
    if (seen.has(it.sense_id)) {
      throw new Error(`[HALT] duplicate sense_id in manifest: ${it.sense_id}`);
    }
    seen.add(it.sense_id);
  }

  // ---- Write artifacts ----
  fs.mkdirSync(OUT_DIR, { recursive: true });
  manifest.sort((a, b) => a.sense_id.localeCompare(b.sense_id));
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(QUARANTINE_PATH, JSON.stringify(quarantine, null, 2));
  fs.writeFileSync(FANOUT_PATH, JSON.stringify(fanout, null, 2));

  printSummary({ manifest, quarantine, fanout, oxfordCollisions });
}

function printSummary(d: {
  manifest: ManifestItem[];
  quarantine: QuarantineEntry[];
  fanout: FanoutRecord[];
  oxfordCollisions: { sense_id: string; kept: string; dropped: string }[];
}): void {
  const { manifest, quarantine, fanout, oxfordCollisions } = d;
  const by = <T extends string>(arr: { toString(): string }[], key: (x: any) => T) => {
    const m = new Map<T, number>();
    for (const x of arr) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const senseSplits = manifest.filter((m) => m.sense_hint !== null);
  const fw = manifest.filter((m) => !CONTENT_POS.has(m.part_of_speech));

  const line = "─".repeat(66);
  console.log(`\n${line}\n STAGE A — ASSEMBLY SUMMARY (gate before Stage B)\n${line}`);
  console.log(`\nManifest (in-scope items): ${manifest.length}`);
  console.log("  by source:", Object.fromEntries(by(manifest, (x) => x.source)));
  console.log("  by POS:   ", Object.fromEntries(by(manifest, (x) => x.part_of_speech)));
  console.log(
    "  by CEFR:  ",
    Object.fromEntries(by(manifest, (x) => String(x.cefr))),
  );

  console.log(`\nQuarantine: ${quarantine.length}`);
  console.log("  by reason:", Object.fromEntries(by(quarantine, (x) => x.reason)));
  console.log("  by raw POS:", Object.fromEntries(by(quarantine, (x) => x.raw_pos)));

  console.log(`\nSense-splits (sense_hint != null): ${senseSplits.length}`);
  for (const s of senseSplits) console.log(`  - ${s.sense_id}  (hint="${s.sense_hint}")`);

  console.log(`\nNAWL→multi-Oxford-sense fan-out (§3.5): ${fanout.length}`);
  for (const f of fanout) console.log(`  - ${f.lemma}/${f.part_of_speech} rank=${f.list_rank} → ${f.sense_ids.join(", ")}`);

  console.log(`\nOxford sense_id collisions (kept lower CEFR): ${oxfordCollisions.length}`);
  for (const c of oxfordCollisions) console.log(`  - ${c.sense_id}: kept ${c.kept}, dropped ${c.dropped}`);

  console.log(`\nKept function words (${fw.length}):`);
  for (const w of fw) console.log(`  - ${w.sense_id}  rank=${w.list_rank}  source=${w.source}`);

  console.log("\nNormalization map (raw → controlled):");
  console.log("  " + Object.entries(POS_MAP).map(([k, v]) => `${k}→${v}`).join(", "));

  // Sample including the bank sense-split.
  console.log("\nSample merged rows:");
  const sample = manifest.filter((m) => m.lemma === "bank").concat(manifest.slice(0, 3));
  for (const s of sample) {
    console.log(`  ${JSON.stringify({ ...s, _carried_hash: s._carried_hash.slice(0, 8) + "…" })}`);
  }

  console.log(`\nArtifacts written:\n  ${MANIFEST_PATH}\n  ${QUARANTINE_PATH}\n  ${FANOUT_PATH}`);
  console.log(`\n${line}\n GATE: review the above before running Stage B generation.\n${line}\n`);
}

main();
