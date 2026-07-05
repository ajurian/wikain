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
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { MasteryState } from "../../domain/card.js";
import type { ReviewTier } from "../../domain/review.js";
import type { Rating } from "../../domain/rating.js";
import type { JudgeVerdict } from "../../domain/verdict.js";

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

/**
 * Per-user verdict memo (spec/05-verdict-memo.md MEMO-1..6, DM-8). One row per (user, memo key); a
 * re-judge under a bumped version overwrites the row (MEMO-6, write-on-judge only). Never shared
 * across accounts (MEMO-5 — `user_id` is part of the PK).
 *
 * The verdict is stored as `jsonb`: unlike the FSRS card/log state (which needs expanded columns to
 * round-trip `Date` fields losslessly — see DM-5 note above), `JudgeVerdict` has NO `Date` fields, so
 * a jsonb blob is lossless here.
 */
export const verdictMemos = pgTable(
  "verdict_memos",
  {
    userId: text("user_id").notNull(),
    // The pure memoKey() (domain/verdictMemo.ts): normalized_sentence + lemma + sense_id (MEMO-2).
    memoKey: text("memo_key").notNull(),
    modelVersion: text("model_version").notNull(),
    rubricVersion: text("rubric_version").notNull(),
    verdict: jsonb("verdict").$type<JudgeVerdict>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.memoKey] })],
);

/**
 * Per-user placement marks (spec/09 SEED-2/7). The existence of a row IS the mark: the user flagged
 * this word placement-known, so the seeder enters it at `Recognized` (SM-11) when the pacer lazily
 * creates its card. No extra columns — a mark carries no state beyond (user, sense). Never shared
 * across accounts (`user_id` is part of the PK). Idempotent inserts (`onConflictDoNothing`, SEED-2).
 */
export const placementMarks = pgTable(
  "placement_marks",
  {
    userId: text("user_id").notNull(),
    senseId: text("sense_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.senseId] })],
);
