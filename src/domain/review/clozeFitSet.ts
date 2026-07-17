import type { ClozeFitEntry } from "../lexicalItem.js";
import { CLOZE_TYPO_MAX_DISTANCE } from "../constants.js";
import { isLemmaMatch } from "./grading.js";
import type { NlpToken } from "./ruleLayer.js";

/** The two no-rating soft-bounce lanes (FIT-7). Recorded per review as FIT-10 instrumentation. */
export type ClozeSoftBounceLane = "same_sense_near_miss" | "different_sense_fit";

/**
 * Where one typed cloze response lands (FIT-6). `target`/`typo` grade `Good`, `wrong` grades
 * `Again`; `soft` produces no rating at all (FIT-7) — the caller owns those consequences.
 */
export type ClozeLane =
  | { kind: "target" }
  | { kind: "soft"; lane: ClozeSoftBounceLane }
  | { kind: "typo" }
  | { kind: "wrong" };

export interface ResolveClozeLaneInput {
  /** Every surface/lemma form of the analyzed response (`formsOf` over the one NLP call). */
  responseForms: readonly string[];
  /** The raw typed string — the FIT-9 typo check runs on what was actually typed, not a lemma. */
  responseRaw: string;
  targetLemma: string;
  /** `null` for a pre-fit-set catalog row: only the target/typo/wrong lanes are resolvable. */
  fitSet: readonly ClozeFitEntry[] | null;
}

/**
 * FIT-6: the three-lane dictionary lookup, in that requirement's table precedence order —
 * target → same_sense_near_miss → different_sense_fit → typo → wrong. Pure over the forms the
 * NLP port already returned (the domain holds no NLP dependency, ARCH-1); the target lane IS the
 * TIER-5 lemma match. Fit-set membership beats typo distance: a listed word one edit from the
 * target (own/owe) is still its own word, not a typo of the target.
 */
export function resolveClozeLane(input: ResolveClozeLaneInput): ClozeLane {
  const { responseForms, responseRaw, targetLemma, fitSet } = input;

  if (isLemmaMatch(responseForms, targetLemma)) return { kind: "target" };

  if (fitSet !== null) {
    for (const lane of ["same_sense_near_miss", "different_sense_fit"] as const) {
      const lemmas = fitSet.filter((e) => e.class === lane).map((e) => e.lemma);
      if (lemmas.some((lemma) => isLemmaMatch(responseForms, lemma))) {
        return { kind: "soft", lane };
      }
    }
  }

  const typed = responseRaw.trim().toLowerCase();
  const target = targetLemma.trim().toLowerCase();
  if (
    typed !== "" &&
    target !== "" &&
    damerauLevenshtein(typed, target) <= CLOZE_TYPO_MAX_DISTANCE
  ) {
    return { kind: "typo" };
  }

  return { kind: "wrong" };
}

/**
 * Restricted Damerau–Levenshtein (optimal string alignment): substitutions, insertions, deletions,
 * and adjacent transpositions each cost 1. Sufficient for the FIT-9 ≤1 threshold — the unrestricted
 * variant differs only at distances ≥3.
 */
export function damerauLevenshtein(a: string, b: string): number {
  // Rolling rows (i-2, i-1, i); `?? Infinity` marks the never-taken out-of-bounds reads so the
  // matrix indexing stays honest under noUncheckedIndexedAccess.
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    const curr: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let best = Math.min(
        (prev[j] ?? Infinity) + 1,
        (curr[j - 1] ?? Infinity) + 1,
        (prev[j - 1] ?? Infinity) + cost,
      );
      if (
        i > 1 &&
        j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        best = Math.min(best, (prev2[j - 2] ?? Infinity) + 1);
      }
      curr.push(best);
    }
    prev2 = prev;
    prev = curr;
  }
  return prev[b.length] ?? 0;
}

const ALPHABETIC_WORD = /^[a-z][a-z'-]*$/i;

/**
 * FIT-11: the "is a plausible word" gate for the heal queue, deliberately approximate — a single
 * alphabetic word token qualifies; multi-word or non-alphabetic input does not. Garbage that slips
 * through is discarded at heal classification (FIT-3 gates it), and the queue's (sense, lemma)
 * dedup bounds the noise. Returns the lemma to log, or null when the response is not a candidate.
 */
export function healCandidateLemma(tokens: readonly NlpToken[]): string | null {
  const words = tokens.filter((t) => t.isWord);
  const word = words.length === 1 ? words[0] : undefined;
  if (word === undefined || !ALPHABETIC_WORD.test(word.normal)) return null;
  return word.lemma.toLowerCase();
}
