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
