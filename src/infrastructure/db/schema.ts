/**
 * Drizzle schema for the per-user persistence slice (spec/12-data-model.md DM-5..DM-7). Two tables:
 * `cards` (one FSRS card per word per user, SM-2) and `review_logs` (append-only from review #1,
 * DM-6/RAT-8). This is the ONLY place the DB shape is declared; the adapter maps the domain's
 * structural types to/from these rows (ARCH-1, STACK-6) so nothing outside infrastructure sees SQL.
 *
 * Design notes:
 * - `mastery` is its OWN column, persisted SEPARATELY from the FSRS internal state and never derived
 *   from it (DM-7 / INV-3).
 * - The FsrsCardState / FsrsReviewLog fields are EXPANDED, `fsrs_`-prefixed columns (not a jsonb
 *   blob) so `Date` fields round-trip losslessly via `timestamp(mode: "date")` — a jsonb blob would
 *   silently downgrade Dates to ISO strings on read.
 * - The float-ish scheduling fields use `doublePrecision`; only the genuinely integral ones
 *   (`reps`/`lapses`/`state`/fsrs rating) use `integer`.
 */
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { MasteryState } from "../../domain/card.js";
import type { ReviewTier } from "../../domain/review.js";
import type { Rating } from "../../domain/rating.js";

/** One FSRS card per (user, word) — SM-2, DM-5. `mastery` kept apart from `fsrs_state` (DM-7). */
export const cards = pgTable(
  "cards",
  {
    userId: text("user_id").notNull(),
    senseId: text("sense_id").notNull(),
    mastery: text("mastery").$type<MasteryState>().notNull(),
    // FsrsCardState (src/domain/card.ts), expanded.
    fsrsDue: timestamp("fsrs_due", { withTimezone: true, mode: "date" }).notNull(),
    fsrsStability: doublePrecision("fsrs_stability").notNull(),
    fsrsDifficulty: doublePrecision("fsrs_difficulty").notNull(),
    fsrsElapsedDays: doublePrecision("fsrs_elapsed_days").notNull(),
    fsrsScheduledDays: doublePrecision("fsrs_scheduled_days").notNull(),
    fsrsReps: integer("fsrs_reps").notNull(),
    fsrsLapses: integer("fsrs_lapses").notNull(),
    fsrsState: integer("fsrs_state").notNull(),
    fsrsLastReview: timestamp("fsrs_last_review", { withTimezone: true, mode: "date" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.senseId] })],
);

/**
 * One graded interaction, append-only (DM-6 / RAT-8). `seq` gives a stable insertion order so
 * `logsForWord` can reproduce the in-memory repo's append-order guarantee the ledger relies on.
 * A rule-layer bounce writes NO row here (INV-2).
 */
export const reviewLogs = pgTable("review_logs", {
  seq: serial("seq").primaryKey(),
  userId: text("user_id").notNull(),
  senseId: text("sense_id").notNull(),
  tier: text("tier").$type<ReviewTier>().notNull(),
  rating: text("rating").$type<Rating>().notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }).notNull(),
  scaffolded: boolean("scaffolded"),
  // FsrsReviewLog (src/domain/review.ts), expanded. `fsrs_rating` is the numeric FSRS grade, distinct
  // from the domain `rating` string above.
  fsrsRating: integer("fsrs_rating").notNull(),
  fsrsState: integer("fsrs_state").notNull(),
  fsrsDue: timestamp("fsrs_due", { withTimezone: true, mode: "date" }).notNull(),
  fsrsStability: doublePrecision("fsrs_stability").notNull(),
  fsrsDifficulty: doublePrecision("fsrs_difficulty").notNull(),
  fsrsElapsedDays: doublePrecision("fsrs_elapsed_days").notNull(),
  fsrsLastElapsedDays: doublePrecision("fsrs_last_elapsed_days").notNull(),
  fsrsScheduledDays: doublePrecision("fsrs_scheduled_days").notNull(),
  fsrsReview: timestamp("fsrs_review", { withTimezone: true, mode: "date" }).notNull(),
});
