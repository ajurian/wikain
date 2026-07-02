import type { LexicalItem } from "../domain/lexicalItem.js";
import { resolveReviewTier } from "../domain/reviewRouting.js";
import type { Catalog } from "./ports/catalog.js";
import type { CardRepository } from "./ports/cardRepository.js";

export interface ResolveReviewPromptInput {
  userId: string;
  senseId: string;
}

export interface ResolveReviewPromptDeps {
  catalog: Catalog;
  cards: CardRepository;
}

/**
 * What the UI renders for a queued word BEFORE the learner responds. The tier is resolved by the same
 * `resolveReviewTier` the grading path uses, so the prompt shown always matches the tier graded. Each
 * arm carries only the fields that tier renders; the correct answer is NOT sent for MCQ/cloze — grading
 * happens server-side on submit (`runReviewPass`).
 */
export type ReviewPrompt =
  | { tier: "recognition"; senseId: string; meaning: string; options: string[] }
  | { tier: "cloze"; senseId: string; clozedSentence: string }
  | { tier: "cued"; senseId: string; meaning: string; selfReferencePrompt: string | null }
  | { tier: "free"; senseId: string; meaning: string; selfReferencePrompt: string | null };

/**
 * Resolve the render-time prompt for one queued word (spec/03 TIER-1/2/5, spec/11 LOOP-1 step 2).
 * A pure read over the catalog + card; it never mutates or grades. A generated field the resolved tier
 * needs but the catalog lacks (a `null`) is a fail-loud error — halt, don't guess (mirrors the build
 * pipeline's stance and DM-4 tolerance handled upstream).
 */
export async function resolveReviewPrompt(
  input: ResolveReviewPromptInput,
  deps: ResolveReviewPromptDeps,
): Promise<ReviewPrompt> {
  const { userId, senseId } = input;

  const card = await deps.cards.load(userId, senseId);
  if (card === undefined) {
    throw new Error(`resolveReviewPrompt: no card for user ${userId} / sense ${senseId}`);
  }
  const item = deps.catalog.get(senseId);
  if (item === undefined) {
    throw new Error(`resolveReviewPrompt: no catalog item for sense ${senseId}`);
  }

  const logs = card.mastery === "Seen" ? await deps.cards.logsForWord(userId, senseId) : [];
  const tier = resolveReviewTier(card.mastery, logs);

  switch (tier) {
    case "recognition":
      return {
        tier,
        senseId,
        meaning: required(item.recognition_meaning, "recognition_meaning", item),
        options: assembleOptions(item),
      };
    case "cloze":
      return {
        tier,
        senseId,
        clozedSentence: required(item.clozed_sentence, "clozed_sentence", item),
      };
    case "cued":
    case "free":
      // Both prompt for a self-produced form/sentence from the productive gloss; they differ only in
      // how the response is graded downstream (deterministic vs judged), not in what is shown.
      return {
        tier,
        senseId,
        meaning: required(item.productive_meaning, "productive_meaning", item),
        selfReferencePrompt: item.self_reference_prompt,
      };
  }
}

/** TIER-2 option assembly: the target word + its distractors, de-duplicated, canonically ordered. The
 * display shuffle is the UI's job (randomness is presentation). Order here is sorted for determinism. */
function assembleOptions(item: LexicalItem): string[] {
  const distractors = required(item.distractors, "distractors", item);
  return [...new Set([item.word, ...distractors])].sort();
}

function required<T>(value: T | null | undefined, field: string, item: LexicalItem): T {
  if (value === null || value === undefined) {
    throw new Error(
      `resolveReviewPrompt: catalog item ${item.sense_id} is missing required field "${field}"`,
    );
  }
  return value;
}
