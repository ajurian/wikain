import type { NlpToken } from "./ruleLayer.js";

/**
 * Every surface/lemma form a set of analyzed tokens presents (DM-9). A pure derivation over the
 * SentenceAnalyzer port's output — NOT a second NLP capability, which is why there is no separate
 * Lemmatizer port: one `analyze` call answers both "what forms are here" and "what are the tokens".
 * Its Python twin is `wikain.nlp.engine.forms_of`, so build and runtime derive forms identically.
 */
export function formsOf(tokens: readonly NlpToken[]): string[] {
  return tokens.flatMap((t) => [t.normal.toLowerCase(), t.lemma.toLowerCase()]);
}

/**
 * TIER-3 / TIER-5: cued production grades by inflection-agnostic lemma match. The candidate NLP
 * forms come from the SentenceAnalyzer port (en-US spaCy, DM-9); this pure rule decides the verdict,
 * so the domain holds no NLP dependency (ARCH-1). The same presence logic backs the rule layer (RL-2).
 */
export function isLemmaMatch(responseForms: readonly string[], targetLemma: string): boolean {
  const target = targetLemma.trim().toLowerCase();
  if (target === "") return false;
  return responseForms.some((form) => form.toLowerCase() === target);
}

/**
 * TIER-2: the recognition MCQ is a pick-the-word choice — the correct option IS the target word, so
 * grading is an exact (case-insensitive) identity, NOT a lemma match. The options are surface words
 * (target + carried distractors); accepting an inflected form would defeat the point of a
 * multiple-choice retrieval. Deterministic, no LLM (TIER-1).
 */
export function isRecognitionCorrect(chosen: string, targetWord: string): boolean {
  const target = targetWord.trim().toLowerCase();
  if (target === "") return false;
  return chosen.trim().toLowerCase() === target;
}
