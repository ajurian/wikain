/*
 * ============================================================================
 * MOCK SESSION SCRIPT — design-time only. TO BE REPLACED.
 * ----------------------------------------------------------------------------
 * Fakes startSession/resolvePrompt (LOOP-1: due-first queue with intros
 * interleaved; tier resolved from mastery, SM-1). The scripted queue below
 * deliberately walks EVERY tier so the whole design is demoable in one run.
 *
 * Design-demo liberty: the recognition MCQ for "coherent" appears right after
 * its introduction. In the real loop the MCQ is a later SPACED review (SM-3);
 * the demo compresses time, the wiring must not.
 * ============================================================================
 */

export type SessionTier =
  | "intro" // New → Seen first introduction (SM-3)
  | "recognition"
  | "cloze"
  | "cued"
  | "free"
  | "maintenance";

export interface MockSessionStep {
  senseId: string;
  tier: SessionTier;
  /** true when this card is a fresh introduction (SEED-6 interleaving) */
  isNewIntroduction?: boolean;
}

export const MOCK_SESSION: MockSessionStep[] = [
  { senseId: "coherent_adj_01", tier: "intro", isNewIntroduction: true },
  { senseId: "coherent_adj_01", tier: "recognition" }, // demo liberty, see header
  { senseId: "feasible_adj_01", tier: "cloze" },
  { senseId: "advocate_verb_01", tier: "cued" },
  { senseId: "negotiate_verb_01", tier: "free" },
  { senseId: "diligent_adj_01", tier: "intro", isNewIntroduction: true },
  { senseId: "meticulous_adj_01", tier: "cued" },
  { senseId: "allocate_verb_01", tier: "free" },
  { senseId: "resilient_adj_01", tier: "maintenance" },
];

/** Deterministic option order for the demo (real MCQ shuffles at render — deferred). */
export function mockMcqOptions(target: string, distractors: readonly string[]): string[] {
  return [distractors[0]!, target, distractors[1]!, distractors[2]!];
}

/** Naive stand-in for the wink lemma match (TIER-5). MOCK — replace. */
export function mockLemmaMatch(response: string, lemma: string): boolean {
  const r = response.trim().toLowerCase();
  const stem = lemma.toLowerCase().slice(0, Math.max(4, lemma.length - 2));
  return r.startsWith(stem) && r.length <= lemma.length + 3;
}
