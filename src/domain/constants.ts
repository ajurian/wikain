/**
 * Named tunable constants (spec/00-overview-invariants.md §3). PRD `[DEFAULT]` numeric values are
 * wired through named constants so behavior asserts configurability + application, not magic
 * literals (INV §1.3). These are the rule-layer (`RL`) constants owned by spec/04.
 */

/** RL-3: a free production needs at least this many content tokens (excluding the target). */
export const DEGENERATE_MIN_CONTENT_TOKENS = 4;

/** RL-3: normalized similarity to `model_sentence` at/above this counts as a verbatim copy. */
export const VERBATIM_SIMILARITY_THRESHOLD = 0.9;

/** RL-6: rule-layer bounces are capped here; the cap reveals the model sentence + offers skip. */
export const MAX_RULE_BOUNCE_RETRIES = 3;
