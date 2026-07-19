import { CUED_TYPO_MAX_DISTANCE } from "../constants.js";
import { isLemmaMatch } from "./grading.js";
import { damerauLevenshtein } from "./clozeFitSet.js";

/**
 * Where one cued-production response lands (CUE-5). `target`/`typo` grade `Good`; `synonym` produces
 * no rating at all (CUE-6, a soft bounce) — the caller owns that consequence; `wrong` grades `Again`.
 */
export type CuedLane =
  | { kind: "target" }
  | { kind: "typo" }
  | { kind: "synonym" }
  | { kind: "wrong" };

export interface ResolveCuedLaneInput {
  /** Every surface/lemma form of the analyzed response (`formsOf` over the one NLP call, CUE-8). */
  responseForms: readonly string[];
  /** The raw typed string — the CUE-5.1 typo check runs on what was actually typed, not a lemma. */
  responseRaw: string;
  targetLemma: string;
  /** `null` (or empty) for a pre-generation catalog row: only target/typo/wrong are resolvable. */
  synonyms: readonly string[] | null;
}

/**
 * CUE-5: the cued grade order, in that requirement's precedence — target (inflection-agnostic lemma
 * match) → target typo (Damerau–Levenshtein ≤ CUED_TYPO_MAX_DISTANCE, CUE-5.1 "treated as match") →
 * same-sense synonym (soft bounce, CUE-5.2) → wrong (CUE-5.3). Pure over the forms the NLP port
 * already returned (the domain holds no NLP dependency, ARCH-1); reuses the cloze tier's
 * `damerauLevenshtein` and `isLemmaMatch` (PRAG-3) — the mechanics are shared, the sets are not
 * (CUE-9: cued consults `cued_valid_synonyms`, never `cloze_fit_set`).
 *
 * Precedence note: target-typo precedes the synonym lane (CUE-5's step order), the inverse of the
 * cloze rule where fit-set membership beats typo distance (FIT-6). A curated same-sense synonym that
 * is also within one edit of the target is therefore graded as a target typo (`Good`) rather than a
 * soft bounce — a rare, benign case (the learner produced the target's near-form and demonstrated the
 * skill), so CUE-5's ordering is kept as written.
 */
export function resolveCuedLane(input: ResolveCuedLaneInput): CuedLane {
  const { responseForms, responseRaw, targetLemma, synonyms } = input;

  if (isLemmaMatch(responseForms, targetLemma)) return { kind: "target" };

  const typed = responseRaw.trim().toLowerCase();
  const target = targetLemma.trim().toLowerCase();
  if (
    typed !== "" &&
    target !== "" &&
    damerauLevenshtein(typed, target) <= CUED_TYPO_MAX_DISTANCE
  ) {
    return { kind: "typo" };
  }

  if (synonyms !== null && synonyms.some((lemma) => isLemmaMatch(responseForms, lemma))) {
    return { kind: "synonym" };
  }

  return { kind: "wrong" };
}
