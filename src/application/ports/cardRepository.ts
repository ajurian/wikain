import type { Card } from "~/domain/mastery/card.js";
import type { ReviewLog } from "~/domain/review/review.js";

/**
 * Per-user persistence port (spec/12-data-model.md DM-5..DM-7). Declared by the application;
 * implemented in infrastructure (in-memory now, Neon later — STACK-3). Narrow by intent (SOLID-4).
 */
export interface CardRepository {
  load(userId: string, senseId: string): Promise<Card | undefined>;
  save(card: Card): Promise<void>;
  /** RAT-8 / DM-6: persist every ReviewLog from review #1. A bounce writes none (INV-2). */
  appendReviewLog(log: ReviewLog): Promise<void>;
  /**
   * The word's persisted ReviewLogs (the read counterpart to `appendReviewLog`). Returns all logs;
   * the judged-pass ledger filters to free passes (INV-4) and derives the SM-5 / CNT-2 spaced-pass
   * counts from them, so the ledger has one source of truth and no running Card field to drift.
   */
  logsForWord(userId: string, senseId: string): Promise<ReviewLog[]>;
  /** All of a user's cards — the counter read-model iterates them to total "words you can now use". */
  listCards(userId: string): Promise<Card[]>;
}
