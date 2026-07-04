/**
 * In-memory VerdictMemoPort (the Drizzle adapter mirrors it — STACK-3). Keeps the judged loop
 * runnable with no database. One entry per (user, memo key); a version mismatch is a miss (MEMO-6).
 */
import type { MemoVersions, VerdictMemoPort } from "../application/ports/verdictMemo.js";
import type { JudgeVerdict } from "../domain/verdict.js";

interface Entry {
  verdict: JudgeVerdict;
  versions: MemoVersions;
}

export class InMemoryVerdictMemo implements VerdictMemoPort {
  private readonly entries = new Map<string, Entry>();

  // `\x00` cannot appear in a userId or memoKey, so no two distinct pairs collide.
  private key(userId: string, memoKey: string): string {
    return `${userId}\x00${memoKey}`;
  }

  async lookup(
    userId: string,
    key: string,
    versions: MemoVersions,
  ): Promise<JudgeVerdict | undefined> {
    const entry = this.entries.get(this.key(userId, key));
    if (entry === undefined) return undefined;
    // MEMO-6: a stale version pair is a miss, not served.
    if (
      entry.versions.modelVersion !== versions.modelVersion ||
      entry.versions.rubricVersion !== versions.rubricVersion
    ) {
      return undefined;
    }
    return entry.verdict;
  }

  async record(
    userId: string,
    key: string,
    verdict: JudgeVerdict,
    versions: MemoVersions,
  ): Promise<void> {
    // MEMO-6: write-on-judge; a re-judge under a bumped version overwrites the stale entry.
    this.entries.set(this.key(userId, key), { verdict, versions });
  }
}
