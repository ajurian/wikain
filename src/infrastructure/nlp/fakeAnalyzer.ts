import type { SentenceAnalyzer } from "~/application/ports/sentenceAnalyzer.js";
import type { NlpToken } from "~/domain/review/ruleLayer.js";

/**
 * The test double for the NLP port — the second sanctioned one, beside `FakeJudge`, and for the same
 * reason: spaCy is now an out-of-process service, so a test that reached it would be an integration
 * test of the container, not of the use-case under test.
 *
 * The engine's REAL behavior is tested where it lives — `python/src/wikain/nlp/engine_test.py` — and
 * the HTTP contract between the two is pinned by `python/src/wikain/service/main_test.py` (the wire
 * token shape) and `httpNlp.test.ts` (this side of it). What is faked here is deliberately only the
 * transport, not the rules: `checkRuleLayer`, `isLemmaMatch` and `formsOf` stay pure domain code and
 * run for real in every test that uses this.
 *
 * The tokenization is a crude split — enough to drive the rules under test, and honest about being
 * approximate. It is NOT trying to reproduce spaCy.
 */
export class FakeAnalyzer implements SentenceAnalyzer {
  /** Surface → lemma overrides, for an irregular form a test depends on (`went` → `go`). */
  constructor(private readonly lemmas: Readonly<Record<string, string>> = {}) {}

  analyze(text: string): Promise<NlpToken[]> {
    const tokens: NlpToken[] = [];
    let previous = "";
    for (const raw of text.split(/(\s+|[.,;:!?"'()]+)/)) {
      const piece = raw.trim();
      if (piece === "") continue;

      const isWord = /[\p{L}\p{N}]/u.test(piece);
      const normal = piece.toLowerCase();
      tokens.push({
        normal,
        lemma: this.lemmas[normal] ?? (isWord ? naiveLemma(normal) : normal),
        pos: isWord ? posOf(normal, previous) : "PUNCT",
        isStopword: STOPWORDS.has(normal),
        isWord,
      });
      previous = normal;
    }
    return Promise.resolve(tokens);
  }
}

/**
 * Regular-suffix stripping — enough that `abandoned` lemmatizes to `abandon`, which is the ONE
 * property the tiers under test actually lean on (TIER-5 accepts an inflected answer, RL-2 finds the
 * target). It is a stand-in, not a model: irregulars need the constructor's override map, and real
 * lemmatization is spaCy's job, verified in `python/src/wikain/nlp/engine_test.py`.
 */
function naiveLemma(word: string): string {
  if (IRREGULAR.has(word)) return IRREGULAR.get(word)!;
  for (const [suffix, replacement] of SUFFIXES) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix)) {
      return word.slice(0, -suffix.length) + replacement;
    }
  }
  return word;
}

/** Ordered longest-first, so `-ies` is tried before `-s`. */
const SUFFIXES: ReadonlyArray<readonly [string, string]> = [
  ["ies", "y"],
  ["ied", "y"],
  ["ing", ""],
  ["ed", ""],
  ["es", ""],
  ["s", ""],
];

const IRREGULAR: ReadonlyMap<string, string> = new Map([
  ["is", "be"],
  ["are", "be"],
  ["was", "be"],
  ["were", "be"],
  ["been", "be"],
  ["has", "have"],
  ["had", "have"],
  ["does", "do"],
  ["did", "do"],
  ["went", "go"],
  ["took", "take"],
  ["made", "make"],
  ["kept", "keep"],
  ["felt", "feel"],
  ["found", "find"],
  ["gave", "give"],
  ["became", "become"],
  ["this", "this"],
  ["his", "his"],
  ["as", "as"],
]);

/**
 * Enough of a POS guess for RL-3's degeneracy rule (which needs "is there a VERB" and "how many
 * content words"). Everything unrecognized is a NOUN — the conservative choice, since it counts as a
 * content word and so never makes a sentence look MORE degenerate than it is.
 *
 * The two heuristics beyond the closed VERBS set exist because a test sentence built around an
 * ARBITRARY catalog lemma (`smokeFixtureItem`) cannot enumerate its verbs in advance: a word after
 * `to` is a bare infinitive, and an `-ed`/`-ing` word is inflected. Without them, every such sentence
 * would look verbless and RL-3 would bounce it as degenerate before it ever reached the judge.
 */
function posOf(word: string, previous: string): string {
  if (VERBS.has(word)) return "VERB";
  if (STOPWORDS.has(word)) return DETERMINERS.has(word) ? "DET" : "ADP";
  if (previous === "to") return "VERB";
  if (word.length > 4 && /(?:ed|ing)$/.test(word)) return "VERB";
  return "NOUN";
}

const DETERMINERS: ReadonlySet<string> = new Set(["the", "a", "an", "this", "that", "my", "her", "his"]);

const STOPWORDS: ReadonlySet<string> = new Set([
  ...DETERMINERS,
  "i", "you", "he", "she", "it", "we", "they",
  "of", "to", "in", "on", "at", "for", "with", "from", "by", "about",
  "and", "or", "but", "so", "as", "than", "when", "if",
]);

const VERBS: ReadonlySet<string> = new Set([
  "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did",
  "went", "go", "goes", "make", "makes", "made", "take", "takes", "took",
  "need", "needs", "needed", "want", "wants", "wanted", "keep", "keeps", "kept",
  "help", "helps", "helped", "use", "uses", "used", "find", "finds", "found",
  "give", "gives", "gave", "feel", "feels", "felt", "become", "becomes", "became",
  "plan", "plans", "work", "works", "try", "tries", "say", "says", "said",
  "see", "sees", "saw", "think", "thinks", "thought", "write", "writes", "wrote",
]);
