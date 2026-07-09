/**
 * Drizzle-backed CardRepository (spec/12-data-model.md DM-5..DM-7, STACK-3/6). Written against a
 * dialect-agnostic Drizzle handle (`DrizzleDb`), so the SAME adapter runs over pglite in tests and
 * Neon in production — only `db` construction differs at the composition root (composition.ts).
 *
 * All Drizzle/SQL types are confined to this file + `db/schema.ts` (ARCH-1); the row<->domain mapping
 * lives in the pure helpers below, mirroring how tsFsrsScheduler.ts confines ts-fsrs to its boundary.
 */
import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { CardRepository } from "../application/ports/cardRepository.js";
import type { Card } from "../domain/card.js";
import type { ReviewLog } from "../domain/review.js";
import { cards, reviewLogs } from "./db/schema.js";

/**
 * Any Drizzle PostgreSQL database handle (pglite, neon-serverless, node-postgres, …). The schema
 * generics are left open (`any`) so a handle constructed with our `schema` is accepted — the adapter
 * only uses the dialect-agnostic query builder, never the relational-query API those generics type.
 */
export type DrizzleDb = PgDatabase<PgQueryResultHKT, any, any>;

type CardRow = typeof cards.$inferSelect;
type CardInsert = typeof cards.$inferInsert;
type LogRow = typeof reviewLogs.$inferSelect;
type LogInsert = typeof reviewLogs.$inferInsert;

function toCardRow(c: Card): CardInsert {
  return {
    userId: c.userId,
    senseId: c.senseId,
    mastery: c.mastery,
    fsrsDue: c.fsrs.due,
    fsrsStability: c.fsrs.stability,
    fsrsDifficulty: c.fsrs.difficulty,
    fsrsElapsedDays: c.fsrs.elapsed_days,
    fsrsScheduledDays: c.fsrs.scheduled_days,
    fsrsReps: c.fsrs.reps,
    fsrsLapses: c.fsrs.lapses,
    fsrsState: c.fsrs.state,
    // Optional in the domain; NULL in the column. Mapped back to `undefined` (not null) on read.
    fsrsLastReview: c.fsrs.last_review ?? null,
  };
}

function fromCardRow(r: CardRow): Card {
  return {
    userId: r.userId,
    senseId: r.senseId,
    mastery: r.mastery,
    fsrs: {
      due: r.fsrsDue,
      stability: r.fsrsStability,
      difficulty: r.fsrsDifficulty,
      elapsed_days: r.fsrsElapsedDays,
      scheduled_days: r.fsrsScheduledDays,
      reps: r.fsrsReps,
      lapses: r.fsrsLapses,
      state: r.fsrsState,
      // Keep the field absent (not `undefined`) when there was no last review, matching the in-memory
      // repo's shape so the contract's `toBeUndefined()` holds identically.
      ...(r.fsrsLastReview ? { last_review: r.fsrsLastReview } : {}),
    },
  };
}

function toLogRow(l: ReviewLog): LogInsert {
  return {
    userId: l.userId,
    senseId: l.senseId,
    tier: l.tier,
    rating: l.rating,
    reviewedAt: l.reviewedAt,
    scaffolded: l.scaffolded ?? null,
    retryCount: l.retryCount ?? null,
    typoFixed: l.typoFixed ?? null,
    latencyMs: l.latencyMs ?? null,
    fsrsRating: l.fsrs.rating,
    fsrsState: l.fsrs.state,
    fsrsDue: l.fsrs.due,
    fsrsStability: l.fsrs.stability,
    fsrsDifficulty: l.fsrs.difficulty,
    fsrsElapsedDays: l.fsrs.elapsed_days,
    fsrsLastElapsedDays: l.fsrs.last_elapsed_days,
    fsrsScheduledDays: l.fsrs.scheduled_days,
    fsrsReview: l.fsrs.review,
  };
}

function fromLogRow(r: LogRow): ReviewLog {
  return {
    userId: r.userId,
    senseId: r.senseId,
    tier: r.tier,
    rating: r.rating,
    reviewedAt: r.reviewedAt,
    ...(r.scaffolded === null ? {} : { scaffolded: r.scaffolded }),
    ...(r.retryCount === null ? {} : { retryCount: r.retryCount }),
    ...(r.typoFixed === null ? {} : { typoFixed: r.typoFixed }),
    ...(r.latencyMs === null ? {} : { latencyMs: r.latencyMs }),
    fsrs: {
      rating: r.fsrsRating,
      state: r.fsrsState,
      due: r.fsrsDue,
      stability: r.fsrsStability,
      difficulty: r.fsrsDifficulty,
      elapsed_days: r.fsrsElapsedDays,
      last_elapsed_days: r.fsrsLastElapsedDays,
      scheduled_days: r.fsrsScheduledDays,
      review: r.fsrsReview,
    },
  };
}

export class DrizzleCardRepository implements CardRepository {
  constructor(private readonly db: DrizzleDb) {}

  async load(userId: string, senseId: string): Promise<Card | undefined> {
    const rows = await this.db
      .select()
      .from(cards)
      .where(and(eq(cards.userId, userId), eq(cards.senseId, senseId)));
    const row = rows[0];
    return row ? fromCardRow(row) : undefined;
  }

  async save(card: Card): Promise<void> {
    const row = toCardRow(card);
    // Upsert = lazy create (SEED-7) + update in one; one card per (user, word) — SM-2.
    const { userId: _userId, senseId: _senseId, ...mutable } = row;
    await this.db
      .insert(cards)
      .values(row)
      .onConflictDoUpdate({
        target: [cards.userId, cards.senseId],
        set: mutable,
      });
  }

  async appendReviewLog(log: ReviewLog): Promise<void> {
    // Append-only from review #1 (DM-6/RAT-8); `seq` autoincrements to fix insertion order.
    await this.db.insert(reviewLogs).values(toLogRow(log));
  }

  async logsForWord(userId: string, senseId: string): Promise<ReviewLog[]> {
    const rows = await this.db
      .select()
      .from(reviewLogs)
      .where(
        and(eq(reviewLogs.userId, userId), eq(reviewLogs.senseId, senseId)),
      )
      .orderBy(asc(reviewLogs.seq));
    return rows.map(fromLogRow);
  }

  async listCards(userId: string): Promise<Card[]> {
    const rows = await this.db
      .select()
      .from(cards)
      .where(eq(cards.userId, userId));
    return rows.map(fromCardRow);
  }
}
