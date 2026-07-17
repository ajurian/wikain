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
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { MasteryState } from "~/domain/mastery/card.js";
import type { ReviewTier } from "~/domain/review/review.js";
import type { ClozeSoftBounceLane } from "~/domain/review/clozeFitSet.js";
import type { Rating } from "~/domain/review/rating.js";
import type { JudgeVerdict } from "~/domain/review/verdict.js";
import type { ClozeFitEntry, ControlledPos } from "~/domain/lexicalItem.js";

// BetterAuth core tables (user/session/account/verification). Re-exported so drizzle-kit + the pglite
// migrator + the drizzleAdapter all see one schema. `user.id` is `uuid` — the app-table `user_id`
// columns below are the same type (STACK-4).
export * from "./authSchema.js";

/** One FSRS card per (user, word) — SM-2, DM-5. `mastery` kept apart from `fsrs_state` (DM-7). */
export const cards = pgTable(
  "cards",
  {
    userId: uuid("user_id").notNull(),
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
  userId: uuid("user_id").notNull(),
  senseId: text("sense_id").notNull(),
  tier: text("tier").$type<ReviewTier>().notNull(),
  rating: text("rating").$type<Rating>().notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }).notNull(),
  scaffolded: boolean("scaffolded"),
  // RAT-5 richer signals, instrumented from day one for the v2 4-button mapping (v1 does not rate on
  // them). All nullable — absent on tiers/paths that don't measure a given signal.
  retryCount: integer("retry_count"),
  typoFixed: boolean("typo_fixed"),
  latencyMs: integer("latency_ms"),
  // FIT-10: the typed-cloze soft-bounce history of the presentation this grade closed. Nullable —
  // only the cloze tier measures them (0/[] there is an honest measurement, not a fabrication).
  softBounceCount: integer("soft_bounce_count"),
  softBounceLanes: jsonb("soft_bounce_lanes").$type<ClozeSoftBounceLane[]>(),
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
    userId: uuid("user_id").notNull(),
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
    userId: uuid("user_id").notNull(),
    senseId: text("sense_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.senseId] })],
);

/**
 * Per-user preferences (spec/10 CNT-8). One row per user (PK `user_id`); absent row = defaults
 * (`DEFAULT_USER_SETTINGS`), resolved in the adapter. `daily_goal` is the learner-adjustable USE goal;
 * `timezone` anchors the "separate calendar days" logic (SM-5b/CNT-2). FK-less by app-table convention.
 *
 * The learner's level band is NOT here — it is placement state, owned by `placement_profile` below. It
 * once lived here as a display-only `level_band` that nothing ever wrote (dropped in migration `0005`).
 */
export const settings = pgTable("settings", {
  userId: uuid("user_id").primaryKey(),
  dailyGoal: integer("daily_goal").notNull(),
  timezone: text("timezone").notNull(),
});

/**
 * Per-user placement profile (spec/09 SEED-1/2/4). One row per user (PK `user_id`); absent row = defaults
 * (`DEFAULT_PLACEMENT_PROFILE`), resolved in the adapter — so a brand-new user reads the SEED-5 default
 * band without a row existing.
 *
 * `frontier_band` is mechanism (i) of SEED-2: WHERE the frontier sits. It is what `startSession` seeds at,
 * so it must persist — before this table the onboarding level choice was discarded and every later session
 * silently reverted to a hardcoded "B2".
 *
 * `lextale_score` is the SEED-4 scalar (nullable: the instrument is optional). `onboarded_at` is nullable
 * because "not yet onboarded" IS the absent value, and it is the single fact the `_onboarded` route guard
 * reads. Deliberately NOT columns on `settings`: different actor (SOLID-1), and `onboarded_at` must stay
 * off the client-writable settings merge-patch.
 */
export const placementProfile = pgTable("placement_profile", {
  userId: uuid("user_id").primaryKey(),
  frontierBand: text("frontier_band").notNull(),
  lextaleScore: doublePrecision("lextale_score"),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true, mode: "date" }),
});

/**
 * The built lexical catalog (spec/12-data-model.md DM-2). GLOBAL, read-only content — the runtime's
 * store of record for the catalog, seeded from `build/out/items.json` at deploy (`db:seed:catalog`),
 * NOT read from the filesystem at request time (serverless: no `fs`/bundle-tracing on the hot path).
 *
 * This is the ONE app table that is NOT `user_id`-scoped (unlike cards/memos/marks/settings — slice 20):
 * the catalog is shared across every learner, so a per-user column would be meaningless. Columns mirror
 * `LexicalItem` (domain/lexicalItem.ts, the consumption contract). Carried fields are NOT NULL (Stage A
 * always fills them); generated fields are nullable (DM-4: some items carry `model_sentence: null`, and
 * an ungenerated item has all-null generated fields). `distractors` is a jsonb `string[]` (no Date, so a
 * blob is lossless — cf. the FSRS-state note above). The `(cefr, zipf_rank)` index backs the frontier
 * selection query (`DrizzleWordSource`, SEED-5): `WHERE cefr = ? ORDER BY zipf_rank ASC`.
 */
export const lexicalItems = pgTable(
  "lexical_items",
  {
    // carried (build Stage A)
    senseId: text("sense_id").primaryKey(),
    word: text("word").notNull(),
    lemma: text("lemma").notNull(),
    partOfSpeech: text("part_of_speech").$type<ControlledPos>().notNull(),
    // Plain text (not `$type<Cefr>`): `WordSource.nextFrontierWords(band: string)` filters on it, and a
    // Cefr-typed column would reject a plain-string band in `eq(...)`. Cast back to Cefr on read.
    cefr: text("cefr"),
    zipf: doublePrecision("zipf").notNull(),
    zipfRank: integer("zipf_rank").notNull(),
    // generated (build Stage B)
    intendedSense: text("intended_sense"),
    recognitionMeaning: text("recognition_meaning"),
    distractors: jsonb("distractors").$type<string[]>(),
    clozedSentence: text("clozed_sentence"),
    productiveMeaning: text("productive_meaning"),
    modelSentence: text("model_sentence"),
    selfReferencePrompt: text("self_reference_prompt"),
    // FIT-1/FIT-4: the classified cloze fit set + the different-sense bounce cue. Nullable like every
    // generated field (a pre-fit-set item degrades to target/typo/wrong at runtime). No Dates → jsonb
    // is lossless (cf. the FSRS-state note above).
    clozeFitSet: jsonb("cloze_fit_set").$type<ClozeFitEntry[]>(),
    bounceGloss: text("bounce_gloss"),
    // provenance
    genModel: text("gen_model").notNull(),
    genSpecVersion: text("gen_spec_version").notNull(),
    // FIT-5: ingest-stamped fit-set provenance; nullable — null on a pre-fit-set item.
    fitSetVersion: integer("fit_set_version"),
  },
  (t) => [index("lexical_items_cefr_rank_idx").on(t.cefr, t.zipfRank)],
);

/**
 * The typed-cloze heal queue (spec/13 FIT-11, DM-10) — the runtime half of the offline heal loop.
 * GLOBAL like `lexical_items` (it describes gaps in the shared catalog, not learners): deliberately
 * NO `user_id`, so a queue export can never leak who typed what. The `(sense_id, typed_lemma)` PK +
 * `onConflictDoNothing` make the write idempotent AND double as the never-re-queue memory across
 * builds; `processed_at` is stamped by the (deferred) heal-ingest tooling, never by the runtime.
 */
export const clozeHealQueue = pgTable(
  "cloze_heal_queue",
  {
    senseId: text("sense_id").notNull(),
    typedLemma: text("typed_lemma").notNull(),
    // The cloze sentence AS PRESENTED — a later fit_set_version may rewrite it, so it is snapshotted.
    clozedSentence: text("clozed_sentence").notNull(),
    queuedAt: timestamp("queued_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [primaryKey({ columns: [t.senseId, t.typedLemma] })],
);
