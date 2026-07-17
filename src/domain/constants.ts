/**
 * Named tunable constants (spec/00-overview-invariants.md §3). PRD `[DEFAULT]` numeric values are
 * wired through named constants so behavior asserts configurability + application, not magic
 * literals (INV §1.3). Grouped by the owning spec file.
 */

// --- Card tiers (spec/03, `TIER`) ---

/** TIER-2: the recognition MCQ presents this many word options (1 target + 3 distractors). */
export const RECOGNITION_MCQ_OPTIONS = 4;

// --- FSRS rating / Seen on-ramp (spec/02, `RAT`) ---

/**
 * RAT-7: a failed typed-cloze at `Seen` drops back to the meaning→word MCQ for at most this many
 * reps before re-attempting cloze. At the cap the word stays on cloze (no MCQ↔cloze ping-pong).
 */
export const SEEN_CLOZE_DROPBACK_CAP = 1;

// --- Rule layer (spec/04, `RL`) ---

/** RL-3: a free production needs at least this many content tokens (excluding the target). */
export const DEGENERATE_MIN_CONTENT_TOKENS = 4;

/** RL-3: normalized similarity to `model_sentence` at/above this counts as a verbatim copy. */
export const VERBATIM_SIMILARITY_THRESHOLD = 0.9;

/** RL-6: rule-layer bounces are capped here; the cap reveals the model sentence + offers skip. */
export const MAX_RULE_BOUNCE_RETRIES = 3;

// --- Typed-cloze fit-set (spec/13, `FIT`) ---

/**
 * FIT-8: cloze soft bounces are capped here; at the cap the submission grades the wrong path
 * (Again) and the target is revealed. Mirrors the MAX_RULE_BOUNCE_RETRIES *pattern* (RL-6) but is
 * its own knob — the two caps tune independently.
 */
export const CLOZE_SOFT_BOUNCE_CAP = 3;

/**
 * FIT-9: a typed cloze within this Damerau–Levenshtein distance of the target lemma takes the
 * typo-fix path (Good, `typoFixed` recorded). The length-scaled variant is Deferred (spec/02).
 */
export const CLOZE_TYPO_MAX_DISTANCE = 1;

// --- Mastery state machine (spec/01, `SM`) ---

/**
 * SM-5(a): `Productive → Fluent` requires this many free *judged* passes on separate calendar days.
 * Stricter than the counter threshold (COUNTER_MIN_SPACED_PASSES) by design — Fluent is a durability
 * badge, the counter answers "can use now" (CNT-6).
 */
export const FLUENT_JUDGED_PASSES = 3;

/** SM-5(c): `Productive → Fluent` requires FSRS stability (in days) at or above this. */
export const FLUENT_MIN_STABILITY_DAYS = 21;

// --- Cloud judge failure path (spec/08, `NET`) ---

/**
 * NET-3: on a timeout / 5xx / transient network error the judge transport retries this many times
 * (with backoff) before surfacing a persistent failure. A transport retry is NOT a learner signal
 * (NET-6) and never touches the rating — distinct from the no-retry-until-pass rule for genuine judge
 * fails (RAT-4). Owned by the adapter; the use-case sees only the final resolved-or-failed outcome.
 */
export const CLOUD_RETRY_COUNT = 1;

// --- Counter / gamification (spec/10, `CNT`) ---

/** CNT-2: a word is counted after this many spaced successful free *judged* productions. */
export const COUNTER_MIN_SPACED_PASSES = 2;

/**
 * CNT-3: a word stays in the counter while `get_retrievability(card, now) ≥` this, evaluated live at
 * read time. Decoupled from REQUEST_RETENTION (0.90) so the headline metric is not jittery.
 */
export const COUNTER_R_FLOOR = 0.7;

/**
 * CNT-8: the default daily USE goal, unit = free judged productions (not minutes/cards/new intros).
 * The fallback when a learner has no persisted `dailyGoal` yet (see `UserSettings`). An independent
 * knob from the §8 intro pace (`NEW_PER_DAY`, SEED-9); they coincide only numerically at 5.
 */
export const DAILY_GOAL_DEFAULT = 5;

/**
 * CNT-8: bounds for the learner-adjustable daily goal — the single source shared by the `/settings`
 * stepper and the `updateSettings` use-case guard, so UI clamp and server validation never drift.
 */
export const DAILY_GOAL_MIN = 1;
export const DAILY_GOAL_MAX = 20;

// --- First-session seeding / placement (spec/09, `SEED`) ---

/**
 * SEED-5: the default starting productive frontier — ~B2, not the NGSL core, because PH receptive
 * proficiency is high. The fallback band for a learner who has neither self-reported nor taken LexTALE
 * (see `DEFAULT_PLACEMENT_PROFILE`). The single source: `placement.ts` and the session start both read it.
 */
export const DEFAULT_FRONTIER_BAND = "B2";

/** SEED-6: first session seeds this many near-frontier words so a production win comes fast (SEED-1). */
export const FIRST_SESSION_SEED_WORDS = 2;

/** SEED-6: the steady-state daily new-introduction pace (a `Seen` interaction). */
export const NEW_PER_DAY = 5;

/**
 * SEED-6: when a due backlog exists, new introductions are capped at this fraction OF THE SESSION
 * (new + due), so reviews never starve. See `introductionPacing.ts` for the closed-form cap.
 */
export const NEW_FRACTION_UNDER_BACKLOG = 0.3;

/**
 * SEED-8: FSRS target retention for new cards. Tunable; decoupled from COUNTER_R_FLOOR (0.70). Wired
 * into the ts-fsrs engine config in the scheduler adapter. Per-user optimization above
 * ~PER_USER_OPT_REVIEW_THRESHOLD reviews is [v2] (deferred, PRAG-1) — v1 uses defaults below that.
 */
export const REQUEST_RETENTION = 0.9;
