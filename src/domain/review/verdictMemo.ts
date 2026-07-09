/**
 * The verdict-memo key (spec/05-verdict-memo.md MEMO-2/3/4). Pure domain: how a free-production
 * submission is reduced to the cache key that a previously-stored verdict is matched on. The memo
 * cache itself (lookup/record, per-user, version-stamped) is an application port
 * (application/ports/verdictMemo.ts) with infrastructure adapters — this module owns only the two
 * pure decisions that must be library-free (ARCH-1): how a sentence normalizes and how the key is
 * built from it.
 */

/**
 * MEMO-3: `normalized_sentence` = lowercase, trim, collapse internal whitespace, strip OUTER
 * punctuation (en-US). Inner punctuation is preserved — only leading/trailing punctuation is removed
 * (a trailing `?` vs `.` must not split otherwise-identical submissions).
 */
export function normalizeSentence(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    // Strip leading/trailing punctuation (anything not a letter, number, or whitespace at the ends).
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N}]+$/u, "")
    .trim();
}

/**
 * MEMO-2: the memo key = `normalized_sentence + target_lemma + intended_sense_id`. Keying on text
 * alone is forbidden — the same sentence for a different target/sense is a DIFFERENT key (MEMO-4:
 * exact-normalized match only, never fuzzy).
 *
 * The triple is JSON-encoded rather than delimiter-joined: JSON is unambiguous (an injective encoding
 * of the array — no field value can spoof the boundary between fields) AND storable — it escapes any
 * stray control characters (e.g. a pasted NUL, which a Postgres `text` column rejects) to safe ASCII.
 */
export function memoKey(parts: {
  normalizedSentence: string;
  lemma: string;
  senseId: string;
}): string {
  return JSON.stringify([parts.normalizedSentence, parts.lemma, parts.senseId]);
}
