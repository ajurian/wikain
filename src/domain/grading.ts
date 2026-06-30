/**
 * TIER-3 / TIER-5: cued production grades by inflection-agnostic lemma match. The candidate NLP
 * forms come from the Lemmatizer port (en-US wink, DM-9); this pure rule decides the verdict, so
 * the domain holds no NLP dependency (ARCH-1). American forms are accepted because the port emits
 * en-US forms (DM-9). The same presence logic backs the rule layer (RL-2) once that lands.
 */
export function isLemmaMatch(responseForms: readonly string[], targetLemma: string): boolean {
  const target = targetLemma.trim().toLowerCase();
  if (target === "") return false;
  return responseForms.some((form) => form.toLowerCase() === target);
}
