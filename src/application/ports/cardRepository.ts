import type { Card } from "../../domain/card.js";
import type { ReviewLog } from "../../domain/review.js";

/**
 * Per-user persistence port (spec/12-data-model.md DM-5..DM-7). Declared by the application;
 * implemented in infrastructure (in-memory now, Neon later — STACK-3). Narrow by intent (SOLID-4).
 */
export interface CardRepository {
  load(userId: string, senseId: string): Promise<Card | undefined>;
  save(card: Card): Promise<void>;
  /** RAT-8 / DM-6: persist every ReviewLog from review #1. A bounce writes none (INV-2). */
  appendReviewLog(log: ReviewLog): Promise<void>;
}
