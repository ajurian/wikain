/**
 * NLP port for inflection-agnostic presence/grading (spec/03-card-tiers.md TIER-5, spec/04 RL-2).
 * The adapter sets the engine to en-US (DM-9). Returns each token's candidate match forms (surface
 * `normal` + `lemma`), lowercased, for the domain's pure lemma-match rule.
 */
export interface Lemmatizer {
  formsOf(text: string): string[];
}
