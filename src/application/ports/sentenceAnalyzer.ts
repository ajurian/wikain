import type { NlpToken } from "../../domain/review/ruleLayer.js";

/**
 * POS-tagging NLP port for the rule layer's degeneracy check (spec/04 RL-3). Kept SEPARATE from the
 * Lemmatizer port (SOLID-4): cued grading needs only `formsOf`, so it must not depend on `analyze`.
 * The same wink adapter implements both. `NlpToken` is owned by the domain (ARCH-1) so this port
 * points inward.
 */
export interface SentenceAnalyzer {
  analyze(text: string): NlpToken[];
}
