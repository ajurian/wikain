/**
 * Stage A — Assembly (docs/BUILD.md §3). Deterministic, NO LLM.
 *
 * Converts the single source CSV (`data/merged_oxford_a2c1_zipf.csv`, columns
 * `word,pos,cefr,zipf,zipf_rank`) into an assembled manifest (carried fields only) + a quarantine
 * side-file, then prints the Stage A exit-gate summary. Nothing here generates content; nothing here
 * invents a carried fact (§0, §8).
 *
 * Run: `npm run stageA`.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  CEFR_LEVELS,
  CONTENT_POS,
  manifestPath,
  MERGED_CSV,
  OUT_DIR,
  POS_MAP,
  QREASON,
  QUARANTINE_PATH,
  type CefrLevel,
} from "./constants.js";
import { readCsv } from "./csv.js";
import type { Cefr, ControlledPos, ManifestItem, QuarantineEntry } from "./types.js";

const VALID_CEFR = new Set(["A1", "A2", "B1", "B2", "C1"]);

/** CEFR ordinal for the low-CEFR-wins tiebreak when a (lemma,pos) appears at two levels. */
const CEFR_ORDER: Record<string, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4 };

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

/** Canonical hash of the carried fields, so Stage B mutation can be detected (§0). */
function carriedHash(it: Omit<ManifestItem, "_carried_hash">): string {
  const canonical = JSON.stringify([
    it.word,
    it.lemma,
    it.part_of_speech,
    it.sense_id,
    it.cefr,
    it.zipf,
    it.zipf_rank,
  ]);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

interface Collision {
  sense_id: string;
  kept: string;
  dropped: string;
}

export interface AssembleResult {
  /** In-scope items grouped by CEFR level, each list sorted by zipf_rank ascending (most frequent first). */
  manifests: Map<CefrLevel, ManifestItem[]>;
  quarantine: QuarantineEntry[];
  collisions: Collision[];
}

/**
 * Pure assembly (§3): CSV rows → per-CEFR manifests (in-scope, deduped, frequency-sorted) + quarantine +
 * CEFR collisions. No I/O — the caller reads/writes files. HALTs on unknown POS, invalid CEFR, a residual
 * duplicate sense_id, or an in-scope item whose CEFR falls outside CEFR_LEVELS.
 */
export function assemble(rows: Record<string, string>[]): AssembleResult {
  const quarantine: QuarantineEntry[] = [];
  const collisions: Collision[] = [];
  const bySenseId = new Map<string, ManifestItem>();

  for (const r of rows) {
    const word = r.word!.trim();
    const rawPos = r.pos!;
    const cefrRaw = r.cefr ?? "";
    const zipf = Number(r.zipf);
    const zipf_rank = Number(r.zipf_rank);
    const pos = normalizePos(rawPos, `word="${word}"`);
    const lemma = word.toLowerCase();

    const cefr: Cefr = VALID_CEFR.has(cefrRaw) ? (cefrRaw as Cefr) : null;
    if (cefr === null) {
      throw new Error(`[HALT] word="${word}" has invalid/empty CEFR "${cefrRaw}".`);
    }
    if (!Number.isFinite(zipf) || !Number.isFinite(zipf_rank)) {
      throw new Error(`[HALT] word="${word}" has non-numeric zipf/zipf_rank ("${r.zipf}"/"${r.zipf_rank}").`);
    }

    // §3.4 scope filter: content POS only. Out-of-scope (modalv/auxiliaryv/…) → quarantine.
    if (!CONTENT_POS.has(pos)) {
      quarantine.push({
        word,
        lemma,
        part_of_speech: pos,
        raw_pos: rawPos,
        cefr,
        zipf,
        zipf_rank,
        reason: QREASON.OUT_OF_SCOPE_POS,
      });
      continue;
    }

    const sense_id = `${lemma}_${pos}_01`;
    const existing = bySenseId.get(sense_id);
    if (existing) {
      // Same (lemma,pos) at two CEFR levels (a merge artifact in the source): keep the LOWER CEFR,
      // flag the collision. zipf/zipf_rank are identical across the pair, so nothing else is lost.
      const keepExisting = CEFR_ORDER[existing.cefr!]! <= CEFR_ORDER[cefr]!;
      collisions.push({
        sense_id,
        kept: keepExisting ? existing.cefr! : cefr!,
        dropped: keepExisting ? cefr! : existing.cefr!,
      });
      if (!keepExisting) {
        const base = { word, lemma, part_of_speech: pos, sense_id, cefr, zipf, zipf_rank };
        bySenseId.set(sense_id, { ...base, _carried_hash: carriedHash(base) });
      }
      continue;
    }

    const base = { word, lemma, part_of_speech: pos, sense_id, cefr, zipf, zipf_rank };
    bySenseId.set(sense_id, { ...base, _carried_hash: carriedHash(base) });
  }

  const manifest = [...bySenseId.values()];

  // ---- Integrity: sense_id must be unique across the whole manifest (dedup handled above). ----
  const seen = new Set<string>();
  for (const it of manifest) {
    if (seen.has(it.sense_id)) throw new Error(`[HALT] duplicate sense_id in manifest: ${it.sense_id}`);
    seen.add(it.sense_id);
  }

  // Group by CEFR level; sort each group by zipf_rank ascending (rank 1 = most frequent → generated first).
  const manifests = new Map<CefrLevel, ManifestItem[]>();
  for (const c of CEFR_LEVELS) manifests.set(c, []);
  for (const it of manifest) {
    if (it.cefr === null || !(CEFR_LEVELS as readonly string[]).includes(it.cefr)) {
      throw new Error(
        `[HALT] in-scope item ${it.sense_id} has out-of-range CEFR "${it.cefr}" ` +
          `(expected one of ${CEFR_LEVELS.join("/")}).`,
      );
    }
    manifests.get(it.cefr as CefrLevel)!.push(it);
  }
  for (const list of manifests.values()) list.sort((a, b) => a.zipf_rank - b.zipf_rank);

  return { manifests, quarantine, collisions };
}

function main(): void {
  const { rows } = readCsv(MERGED_CSV);
  const { manifests, quarantine, collisions } = assemble(rows);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  // One manifest file per level (empty [] included, so feed/ingest never hit a missing file).
  for (const cefr of CEFR_LEVELS) {
    fs.writeFileSync(manifestPath(cefr), JSON.stringify(manifests.get(cefr) ?? [], null, 2));
  }
  fs.writeFileSync(QUARANTINE_PATH, JSON.stringify(quarantine, null, 2));

  printSummary({ manifests, quarantine, collisions });
}

function printSummary(d: {
  manifests: Map<CefrLevel, ManifestItem[]>;
  quarantine: QuarantineEntry[];
  collisions: Collision[];
}): void {
  const { manifests, quarantine, collisions } = d;
  const manifest = [...manifests.values()].flat();
  const by = <T extends string, X>(arr: readonly X[], key: (x: X) => T) => {
    const m = new Map<T, number>();
    for (const x of arr) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const line = "─".repeat(66);
  console.log(`\n${line}\n STAGE A — ASSEMBLY SUMMARY (gate before Stage B)\n${line}`);
  console.log(`\nManifest (in-scope items): ${manifest.length}`);
  console.log(
    "  per CEFR manifest:",
    Object.fromEntries(CEFR_LEVELS.map((c) => [c, manifests.get(c)?.length ?? 0])),
  );
  console.log("  by POS: ", Object.fromEntries(by(manifest, (x) => x.part_of_speech)));

  console.log(`\nQuarantine: ${quarantine.length}`);
  console.log("  by reason:", Object.fromEntries(by(quarantine, (x) => x.reason)));
  console.log("  by raw POS:", Object.fromEntries(by(quarantine, (x) => x.raw_pos)));
  for (const q of quarantine) console.log(`  - ${q.word}/${q.raw_pos} (cefr=${q.cefr}, ${q.reason})`);

  console.log(`\nCEFR collisions on (lemma,pos), kept lower CEFR: ${collisions.length}`);
  for (const c of collisions) console.log(`  - ${c.sense_id}: kept ${c.kept}, dropped ${c.dropped}`);

  console.log("\nNormalization map (raw → controlled):");
  console.log("  " + Object.entries(POS_MAP).map(([k, v]) => `${k}→${v}`).join(", "));

  console.log("\nSample rows:");
  for (const s of manifest.slice(0, 4)) {
    console.log(`  ${JSON.stringify({ ...s, _carried_hash: s._carried_hash.slice(0, 8) + "…" })}`);
  }

  console.log(
    "\nArtifacts written:\n  " +
      CEFR_LEVELS.map((c) => manifestPath(c)).join("\n  ") +
      `\n  ${QUARANTINE_PATH}`,
  );
  console.log(`\n${line}\n GATE: review the above before running Stage B generation.\n${line}\n`);
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
