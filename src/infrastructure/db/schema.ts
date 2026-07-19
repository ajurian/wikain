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
import type { BatchQueueEntry } from "~/domain/scheduling/batch.js";

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
  // BAT-15: card-shown → gradeable outcome incl. judge wait — feeds the Deferred effort-weight
  // recompute (spec/14). Distinct from latency_ms (submit → outcome).
  durationMs: integer("duration_ms"),
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
  // UI theme preference (light|dark|system). DB default backfills pre-existing rows to THEME_DEFAULT.
  theme: text("theme").notNull().default("system"),
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

/**
 * The active mini-session batch, one row per user (spec/14 BAT-11). Pure PRESENTATION state —
 * discardable by design (BAT-13 replaces it wholesale, Done deletes it); ratings/FSRS never live
 * here (BAT-1). `entries` is jsonb: `BatchQueueEntry` carries no Dates, so a blob is lossless (cf.
 * the FSRS-state note above) and the whole-row upsert stays one statement.
 */
export const sessionState = pgTable("session_state", {
  userId: uuid("user_id").primaryKey(),
  batchId: uuid("batch_id").notNull(),
  batchNumber: integer("batch_number").notNull(),
  entries: jsonb("entries").$type<BatchQueueEntry[]>().notNull(),
  progressIndex: integer("progress_index").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
  lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true, mode: "date" }).notNull(),
});

/**
 * The seeding ledger (spec/09 SEED-10/11, refining BAT-14): the absolute instant introduction seeding
 * last ran for this user. Stored as a timestamp, NOT a day key (SEED-11), so the rail can answer BOTH
 * the calendar-day boundary and the min-gap (SEED_MIN_GAP_HOURS) comparisons off the one value. Its own
 * table, NOT a `session_state` column, because it must survive the BAT-13 replacement and the
 * Done-clear — a pacing ledger fact, not presentation state.
 */
export const seedLedger = pgTable("seed_ledger", {
  userId: uuid("user_id").primaryKey(),
  lastSeedAt: timestamp("last_seed_at", { withTimezone: true, mode: "date" }).notNull(),
  // SEED-11: cumulative introductions stamped at `last_seed_at`, read relative to that instant's
  // learner-local day (the day-cap resets when the day rolls). Additive with a 0 default.
  seededCount: integer("seeded_count").notNull().default(0),
});

/**
 * Seeding-rail instrumentation (spec/09 SEED-14), written by the runtime and read offline to tune
 * `SEED_MIN_GAP_HOURS` and confirm the rail rarely binds. Append-only; `outcome` distinguishes a
 * grant (carries `count` + `had_backlog`) from a denial (carries `failing_clause`). A
 * `failing_clause = 'min_gap'` row is exactly a boundary-burst the new gap clause caught.
 */
export const seedEvents = pgTable(
  "seed_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    at: timestamp("at", { withTimezone: true, mode: "date" }).notNull(),
    outcome: text("outcome").$type<"granted" | "denied">().notNull(),
    count: integer("count"),
    hadBacklog: boolean("had_backlog"),
    failingClause: text("failing_clause").$type<"daily_cap" | "min_gap">(),
  },
  (t) => [index("seed_events_user_idx").on(t.userId)],
);

/**
 * Per-batch instrumentation (spec/14 BAT-16), written by the runtime and read offline for the
 * amendment's hypothesis tests. `outcome` null = still open (a never-returning abandoner's row is
 * finalized at the next return; analytics treat open-and-stale as abandoned). The finalize is
 * guarded `WHERE outcome IS NULL` in the adapter, which is the whole idempotence mechanism.
 */
export const reviewBatches = pgTable(
  "review_batches",
  {
    batchId: uuid("batch_id").primaryKey(),
    userId: uuid("user_id").notNull(),
    batchNumber: integer("batch_number").notNull(),
    plannedTierCounts: jsonb("planned_tier_counts").$type<Record<ReviewTier, number>>().notNull(),
    plannedUnits: integer("planned_units").notNull(),
    plannedCards: integer("planned_cards").notNull(),
    builtAt: timestamp("built_at", { withTimezone: true, mode: "date" }).notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true, mode: "date" }),
    outcome: text("outcome").$type<"completed" | "abandoned">(),
    completedCount: integer("completed_count"),
    abandonedAtPosition: integer("abandoned_at_position"),
    abandonedAtTier: text("abandoned_at_tier").$type<ReviewTier>(),
    wallClockMs: integer("wall_clock_ms"),
    continueChosen: boolean("continue_chosen"),
  },
  (t) => [index("review_batches_user_idx").on(t.userId)],
);
