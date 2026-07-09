import type { JudgeVerdict } from "../../domain/review/verdict.js";

/**
 * The judge version pair a memo row is stamped with (spec/05 MEMO-6). Swapping the model or the
 * rubric bumps one of these; a stored verdict written under an old pair is treated as stale (a miss),
 * never served. Sourced at the composition root from the judge config (JDG-9 / RUBRIC_VERSION).
 */
export interface MemoVersions {
  modelVersion: string;
  rubricVersion: string;
}

/**
 * The per-user verdict memo (spec/05-verdict-memo.md MEMO-1/5/6, ARCH-3). A cheap cache that lets an
 * identical resubmission skip a billable judge call — it MUST NOT change any gate outcome (a hit
 * returns the byte-identical stored verdict). Narrow by intent (SOLID-4): lookup before the judge,
 * record on judge. Both are scoped by `userId` (MEMO-5 — a verdict is never served across accounts).
 *
 * The key is the pure `memoKey(...)` (domain/verdictMemo.ts, MEMO-2); the version pair is matched
 * separately so a rubric/model bump invalidates without rewriting keys (MEMO-6).
 */
export interface VerdictMemoPort {
  /**
   * MEMO-1/4/6: return the stored verdict iff there is an exact-normalized key hit for this user
   * AND the stored versions equal `versions`. Any mismatch (missing row or stale versions) is a miss
   * (`undefined`) → the caller proceeds to the judge.
   */
  lookup(userId: string, key: string, versions: MemoVersions): Promise<JudgeVerdict | undefined>;

  /**
   * MEMO-6: write-on-judge only. Store (or overwrite) the verdict for this user + key under the
   * current versions. There is no override→overwrite path other than a fresh judge under a bumped
   * version replacing a stale row.
   */
  record(
    userId: string,
    key: string,
    verdict: JudgeVerdict,
    versions: MemoVersions,
  ): Promise<void>;
}
