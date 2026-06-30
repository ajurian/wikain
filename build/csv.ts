/**
 * Minimal CSV reader for the build pipeline. The three source CSVs are simple: a header row,
 * comma-separated, no quoted fields and no embedded commas (verified — headwords like
 * `bank(river)` contain no commas). We deliberately do not pull in a CSV library; if a quoted
 * field ever appears, `readCsv` throws so the assumption fails loudly rather than silently
 * mis-parsing.
 */
import fs from "node:fs";

export interface CsvFile {
  header: string[];
  rows: Record<string, string>[];
}

export function readCsv(filePath: string): CsvFile {
  let text = fs.readFileSync(filePath, "utf8");
  // Strip UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes('"')) {
    throw new Error(
      `readCsv: ${filePath} contains a double-quote — the no-quoting assumption is violated; ` +
        `use a real CSV parser before trusting this file.`,
    );
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.length > 0);

  if (lines.length === 0) throw new Error(`readCsv: ${filePath} is empty`);

  const header = lines[0]!.split(",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(",");
    if (cells.length !== header.length) {
      throw new Error(
        `readCsv: ${filePath} line ${i + 1} has ${cells.length} fields, expected ${header.length}: "${lines[i]}"`,
      );
    }
    const row: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) row[header[c]!] = cells[c]!.trim();
    rows.push(row);
  }

  return { header, rows };
}
