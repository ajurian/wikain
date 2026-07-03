/*
 * ============================================================================
 * MOCK JUDGE — design-time only. TO BE REPLACED.
 * ----------------------------------------------------------------------------
 * Simulates the judged free-production branch (rule layer RL-2/3/4 → memo →
 * DeepSeek judge JDG-* → verdict LOOP-4) entirely client-side so every UI
 * state is demoable. When wiring, replace with the real server function that
 * runs submitFreeProduction; delete this file.
 *
 * Demo triggers (documented so designers can exercise every state):
 *   - omit the target word            → bounce: absent (RL-2)
 *   - fewer than 5 words              → bounce: degenerate (RL-3)
 *   - include a Tagalog word (e.g. "talaga", "kasi") → bounce: Taglish (RL-4)
 *   - include "(fail)"                → judged sense-fail (LOOP-4 fail path)
 *   - include "(error)"               → transient cloud failure (NET-3)
 *   - include "(offline)"             → offline-at-submit (NET-5)
 *   - include "very" or "really"      → pass WITH polish edits (EDIT-7)
 *   - otherwise                       → clean pass (+ enrichment)
 * ============================================================================
 */

import type { MockLexicalItem } from "./catalog";

export type MockBounceKind = "absent" | "degenerate" | "taglish";

export interface MockReplacement {
  find: string;
  replace: string;
  reason: "sense" | "grammar" | "collocation" | "register";
  oneLineFeedback: string;
}

export type MockJudgeResult =
  | { kind: "bounce"; bounce: MockBounceKind }
  | { kind: "offline" } // NET-5
  | { kind: "unavailable" } // NET-3/4 after one retry
  | {
      kind: "judged";
      passed: boolean;
      detectedSense?: string;
      replacements: MockReplacement[];
      /** EDIT-4 fallback only — never the primary display (EDIT-7) */
      correctedSentence?: string;
      enrichment?: string;
    };

/** Tiny stand-in for the shipped Tagalog lexicon (RL-4). MOCK — replace. */
const TAGALOG_WORDS = new Set([
  "ang", "ng", "mga", "ako", "ikaw", "siya", "kasi", "talaga", "hindi", "oo",
  "salamat", "po", "naman", "lang", "yung", "dito", "kahapon", "bukas",
]);

const CHECKING_DELAY_MS = 1400; // simulated backend+model round-trip (NET-2)

function tokenize(sentence: string): string[] {
  return sentence.toLowerCase().split(/[^a-zA-Z']+/).filter(Boolean);
}

/** Naive lemma-presence stand-in for wink-nlp (RL-2). MOCK — replace. */
function containsLemma(tokens: string[], lemma: string): boolean {
  const stem = lemma.toLowerCase().slice(0, Math.max(4, lemma.length - 2));
  return tokens.some((t) => t.startsWith(stem));
}

export function mockRuleLayer(sentence: string, item: MockLexicalItem): MockBounceKind | null {
  const tokens = tokenize(sentence);
  if (!containsLemma(tokens, item.lemma)) return "absent";
  if (tokens.some((t) => TAGALOG_WORDS.has(t))) return "taglish";
  if (tokens.length < 5) return "degenerate";
  return null;
}

/**
 * Full mock submit: rule layer (instant) then simulated judge round-trip.
 * The caller shows CheckingIndicator only when the promise path is "judged-ish"
 * (i.e. mockRuleLayer returned null) — matching NET-2.
 */
export async function mockJudgeSubmit(
  sentence: string,
  item: MockLexicalItem,
): Promise<MockJudgeResult> {
  const bounce = mockRuleLayer(sentence, item);
  if (bounce) return { kind: "bounce", bounce }; // instant, no delay (NET-2)

  if (sentence.includes("(offline)")) return { kind: "offline" };

  await new Promise((r) => setTimeout(r, CHECKING_DELAY_MS));

  if (sentence.includes("(error)")) return { kind: "unavailable" };

  if (sentence.includes("(fail)")) {
    // Scripted sense-fail: strike the learner's use of the target word (a span
    // that is guaranteed to exist in the raw sentence — EDIT-3).
    const match = new RegExp(`\\b${item.lemma}\\w*\\b`, "i").exec(sentence);
    return {
      kind: "judged",
      passed: false,
      detectedSense: `a different sense of “${item.lemma}” than the one being practiced`,
      replacements: match
        ? [
            {
              find: match[0],
              replace: item.lemma,
              reason: "sense",
              oneLineFeedback: `Here “${item.lemma}” means: ${item.recognitionMeaning}.`,
            },
          ]
        : [],
      correctedSentence: item.modelSentence,
    };
  }

  // Polish-edit pass: quote a span we know occurs in the sentence (EDIT-3).
  const polishTarget = [" very ", " really "].find((w) => sentence.toLowerCase().includes(w));
  if (polishTarget) {
    const idx = sentence.toLowerCase().indexOf(polishTarget);
    const raw = sentence.slice(idx, idx + polishTarget.length);
    return {
      kind: "judged",
      passed: true,
      replacements: [
        {
          find: raw.trim(),
          replace: "genuinely",
          reason: "collocation",
          oneLineFeedback: "A more precise intensifier reads better in formal writing.",
        },
      ],
    };
  }

  return {
    kind: "judged",
    passed: true,
    replacements: [],
    enrichment: `You could also say: “${item.modelSentence}”`,
  };
}
