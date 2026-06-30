/**
 * In-memory CardRepository (the Neon adapter lands later — STACK-3). Keeps the cued-review slice
 * runnable with no database. Cards are keyed per user + sense (one card per word per user, SM-2).
 */
import type { CardRepository } from "../application/ports/cardRepository.js";
import type { Card } from "../domain/card.js";
import type { ReviewLog } from "../domain/review.js";

export class InMemoryCardRepository implements CardRepository {
  private readonly cards = new Map<string, Card>();
  /** Every persisted ReviewLog, in append order (RAT-8 / DM-6). */
  readonly reviewLogs: ReviewLog[] = [];

  private key(userId: string, senseId: string): string {
    return `${userId}-${senseId}`;
  }

  async load(userId: string, senseId: string): Promise<Card | undefined> {
    return this.cards.get(this.key(userId, senseId));
  }

  async save(card: Card): Promise<void> {
    this.cards.set(this.key(card.userId, card.senseId), card);
  }

  async appendReviewLog(log: ReviewLog): Promise<void> {
    this.reviewLogs.push(log);
  }

  async logsForWord(userId: string, senseId: string): Promise<ReviewLog[]> {
    return this.reviewLogs.filter((l) => l.userId === userId && l.senseId === senseId);
  }

  async listCards(userId: string): Promise<Card[]> {
    return [...this.cards.values()].filter((c) => c.userId === userId);
  }
}
