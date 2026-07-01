/**
 * Precise-replacement edit resolution (spec/07-edit-resolution.md). Pure, in-process: it turns the
 * judge's find/replace string pairs (`verdict.replacements`, JDG-4/EDIT-1) into character spans over
 * the RAW learner sentence, or falls back to the whole-sentence `corrected_sentence` when any edit
 * can't be uniquely located.
 *
 * EDIT-1 is satisfied upstream by the `Replacement` shape (find/replace strings, never model indices);
 * deterministic code here computes positions from the quoted span.
 *
 * EDIT-2: resolution is presentation, never adjudication — this function takes no gate/verdict outcome
 * and returns none, so it structurally cannot change whether a sentence passed.
 *
 * EDIT-7 (inline strikethrough/insertion render, color-by-reason, on-demand one_line_feedback) is the
 * presentation layer's job and is deferred (PRAG-1); the `ResolvedEdit[]` here is its render input.
 */
import type { Replacement } from "./verdict.js";

/** One resolved edit: a character span in the raw learner sentence plus its replacement + reason. */
export interface ResolvedEdit {
  /** [start, end) character span in the RAW learner sentence (EDIT-3). */
  start: number;
  end: number;
  find: string;
  replace: string;
  reason: Replacement["reason"];
}

export type EditResolution =
  | { kind: "inline"; edits: ResolvedEdit[] }
  /** EDIT-4: >=1 edit could not be uniquely located — show corrected_sentence for the whole sentence. */
  | { kind: "fallback"; correctedSentence: string };

/**
 * EDIT-6 overlap priority: keep the first by `sense > grammar > collocation > register`. A fixed
 * domain rule, not a tunable — it stays in-module (cf. `CONTENT_POS` in ruleLayer.ts), not constants.ts.
 */
const REASON_PRIORITY: Record<Replacement["reason"], number> = {
  sense: 0,
  grammar: 1,
  collocation: 2,
  register: 3,
};

/**
 * Resolve `replacements` against `rawSentence`. Returns inline spans when every edit locates uniquely,
 * else the whole-sentence corrected_sentence fallback (EDIT-4, binary reading: one failure suppresses
 * all inline rendering). Empty `replacements` is a clean inline result, not a fallback.
 */
export function resolveEdits(
  rawSentence: string,
  replacements: readonly Replacement[],
  correctedSentence: string,
): EditResolution {
  const resolved: ResolvedEdit[] = [];

  for (const replacement of replacements) {
    const span = uniqueSpan(rawSentence, replacement.find);
    // EDIT-4: zero matches (paraphrased, incl. empty find) or >=2 matches (ambiguous) → never guess a
    // position; fall back to the whole-sentence corrected_sentence.
    if (span === null) {
      return { kind: "fallback", correctedSentence };
    }
    resolved.push({
      start: span.start,
      end: span.end,
      find: replacement.find,
      replace: replacement.replace,
      reason: replacement.reason,
    });
  }

  const deduped = dropOverlapsByPriority(resolved);

  // EDIT-5: apply right-to-left — descending start keeps earlier offsets valid as later spans splice.
  deduped.sort((a, b) => b.start - a.start);
  return { kind: "inline", edits: deduped };
}

/**
 * EDIT-3/EDIT-4: locate `find` as a substring of `raw`. Exactly one occurrence → its [start, end);
 * zero or >=2 occurrences → null (unresolvable). An empty `find` cannot uniquely locate a deletion, so
 * it is unresolvable too.
 */
function uniqueSpan(raw: string, find: string): { start: number; end: number } | null {
  if (find === "") return null;

  const first = raw.indexOf(find);
  if (first === -1) return null;
  if (raw.indexOf(find, first + 1) !== -1) return null; // a second occurrence → ambiguous

  return { start: first, end: first + find.length };
}

/**
 * EDIT-6: when two resolved spans overlap, keep the higher-priority reason and drop the lower. Walks
 * spans in start order, keeping a running set of accepted spans; a candidate overlapping an accepted
 * higher-or-equal-priority span is dropped, and it evicts an accepted lower-priority overlapper.
 */
function dropOverlapsByPriority(edits: readonly ResolvedEdit[]): ResolvedEdit[] {
  const kept: ResolvedEdit[] = [];

  for (const candidate of edits) {
    const overlapping = kept.filter((k) => overlaps(k, candidate));
    if (overlapping.some((k) => REASON_PRIORITY[k.reason] <= REASON_PRIORITY[candidate.reason])) {
      continue; // an equal-or-higher-priority span already occupies this range — drop the candidate.
    }
    // else the candidate outranks every overlapper: evict them and keep it.
    for (const loser of overlapping) kept.splice(kept.indexOf(loser), 1);
    kept.push(candidate);
  }

  return kept;
}

/** Half-open span overlap: they share at least one character position. */
function overlaps(a: ResolvedEdit, b: ResolvedEdit): boolean {
  return a.start < b.end && b.start < a.end;
}
