/**
 * Stage A rule layer (spec/04-rule-layer.md) — the free, in-process, deterministic pre-screen that
 * gates the cloud judge. Pure: it decides over NLP data supplied by the SentenceAnalyzer/Lemmatizer
 * ports (the established "port supplies NLP forms, a domain rule decides" convention — wink stays out
 * of the domain, ARCH-1). A bounce produces NO rating and NO scheduler call (INV-2 / RAT-2); that is
 * enforced by the caller (submitFreeProduction), which simply never schedules on a bounce.
 */
import { isLemmaMatch } from "./grading.js";
import { DEGENERATE_MIN_CONTENT_TOKENS, VERBATIM_SIMILARITY_THRESHOLD } from "../constants.js";

/**
 * Structural token data the rule layer reasons over. Declared in the domain (no NLP library) so the
 * analyzer port (application) can reference it without the domain pointing outward (ARCH-1). `pos` is
 * the wink Universal POS tag (NOUN/VERB/ADJ/ADV/PROPN/DET/ADP/PRON/…); `isWord` excludes punctuation.
 */
export interface NlpToken {
  normal: string;
  lemma: string;
  pos: string;
  isStopword: boolean;
  isWord: boolean;
}

/** The three rule-layer rejection reasons (RL-2/RL-3/RL-4). A bounce is NOT a review (INV-2). */
export type RuleBounceReason = "absent" | "degenerate" | "taglish";

export type RuleResult = { ok: true } | { ok: false; reason: RuleBounceReason };

/** UPOS tags that count as content words (RL-3 content-token count). */
const CONTENT_POS: ReadonlySet<string> = new Set(["NOUN", "VERB", "ADJ", "ADV", "PROPN"]);

export interface RuleLayerInput {
  targetLemma: string;
  /** Candidate match forms of the response (Lemmatizer.formsOf) — drives presence (RL-2). */
  responseForms: readonly string[];
  /** POS-tagged response tokens (SentenceAnalyzer.analyze) — drives degeneracy + Taglish. */
  responseTokens: readonly NlpToken[];
  /** Normalized word forms of the item's model_sentence, or null when it carries none (DM-4). */
  modelSentenceWords: readonly string[] | null;
  /** Shipped Tagalog lexicon, lowercased (RL-4). */
  tagalogLexicon: ReadonlySet<string>;
}

/**
 * Run the three checks in order and return the first bounce, or `{ ok: true }` to proceed to the
 * judge. Order is presence → degeneracy → Taglish: presence is the INV-2 core (a missing target is
 * the cheapest, most important bounce); the order only decides which reason is reported when a
 * malformed sentence would trip more than one check.
 */
export function checkRuleLayer(input: RuleLayerInput): RuleResult {
  // RL-2: presence by inflection-agnostic lemma match. Mis-inflected-but-present is NOT a bounce —
  // bouncing a real attempt as "absent" would inject the phantom lapse INV-2 forbids.
  if (!isLemmaMatch(input.responseForms, input.targetLemma)) {
    return { ok: false, reason: "absent" };
  }

  if (isDegenerate(input)) return { ok: false, reason: "degenerate" };

  // RL-4: a Tagalog word anywhere → code-switching nudge. An all-English L1-interference sentence
  // carries no lexicon hit, so it proceeds to the judge to be corrected-and-passed (JDG-7).
  if (input.responseTokens.some((t) => t.isWord && input.tagalogLexicon.has(t.normal))) {
    return { ok: false, reason: "taglish" };
  }

  return { ok: true };
}

/**
 * RL-3 degeneracy: fewer than DEGENERATE_MIN_CONTENT_TOKENS content tokens excluding the target, OR
 * no finite verb (UPOS VERB), OR a near-verbatim copy of model_sentence (similarity ≥ threshold).
 */
function isDegenerate(input: RuleLayerInput): boolean {
  const target = input.targetLemma.trim().toLowerCase();

  const contentTokens = input.responseTokens.filter(
    (t) => t.isWord && CONTENT_POS.has(t.pos) && t.lemma !== target && t.normal !== target,
  );
  if (contentTokens.length < DEGENERATE_MIN_CONTENT_TOKENS) return true;

  const hasFiniteVerb = input.responseTokens.some((t) => t.pos === "VERB");
  if (!hasFiniteVerb) return true;

  if (input.modelSentenceWords && input.modelSentenceWords.length > 0) {
    const responseWords = input.responseTokens.filter((t) => t.isWord).map((t) => t.normal);
    if (jaccardSimilarity(responseWords, input.modelSentenceWords) >= VERBATIM_SIMILARITY_THRESHOLD) {
      return true;
    }
  }

  return false;
}

/**
 * Normalized word-set overlap (Jaccard) — the verbatim-copy heuristic for RL-3. A true copy scores
 * 1.0; an original sentence scores low. Tuning this from real data is Deferred (spec/04).
 */
function jaccardSimilarity(a: readonly string[], b: readonly string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
