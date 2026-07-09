/**
 * Drizzle-backed VerdictMemoPort (spec/05 MEMO-1..6, DM-8, STACK-3/6). Written against the same
 * dialect-agnostic `DrizzleDb` handle as the card repository, so the SAME adapter runs over pglite in
 * tests and Neon in production — only `db` construction differs at the composition root.
 *
 * All Drizzle/SQL types stay confined to this file + `db/schema.ts` (ARCH-1). The verdict is stored
 * as jsonb (lossless — `JudgeVerdict` has no `Date` fields), so no row<->domain mapping is needed
 * beyond the column names.
 */
import { and, eq } from "drizzle-orm";
import type { MemoVersions, VerdictMemoPort } from "../../application/ports/verdictMemo.js";
import type { JudgeVerdict } from "../../domain/review/verdict.js";
import type { DrizzleDb } from "./drizzleCardRepository.js";
import { verdictMemos } from "../db/schema.js";

export class DrizzleVerdictMemo implements VerdictMemoPort {
  constructor(private readonly db: DrizzleDb) {}

  async lookup(
    userId: string,
    key: string,
    versions: MemoVersions,
  ): Promise<JudgeVerdict | undefined> {
    const rows = await this.db
      .select()
      .from(verdictMemos)
      .where(and(eq(verdictMemos.userId, userId), eq(verdictMemos.memoKey, key)));
    const row = rows[0];
    if (row === undefined) return undefined;
    // MEMO-6: a stale version pair is a miss (the next judge overwrites it in `record`).
    if (row.modelVersion !== versions.modelVersion || row.rubricVersion !== versions.rubricVersion) {
      return undefined;
    }
    return row.verdict;
  }

  async record(
    userId: string,
    key: string,
    verdict: JudgeVerdict,
    versions: MemoVersions,
  ): Promise<void> {
    // MEMO-6: write-on-judge; a re-judge under a bumped version overwrites the stale row (upsert).
    await this.db
      .insert(verdictMemos)
      .values({
        userId,
        memoKey: key,
        modelVersion: versions.modelVersion,
        rubricVersion: versions.rubricVersion,
        verdict,
      })
      .onConflictDoUpdate({
        target: [verdictMemos.userId, verdictMemos.memoKey],
        set: {
          modelVersion: versions.modelVersion,
          rubricVersion: versions.rubricVersion,
          verdict,
        },
      });
  }
}
