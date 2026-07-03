import type { LexicalItem } from "../domain/lexicalItem.js";
import type { MasteryState } from "../domain/card.js";
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
 * arm carries only the fields that tier renders; the correct answer is NOT sent for MCQ/cloze/cued —
 * grading happens server-side on submit (`runReviewPass`). `mastery` (the word's pre-review state) is
 * carried on every arm for the tier sub-label (e.g. "· productive", or "maintenance" at Fluent).
 *
 * Note the asymmetry between `cued` and `free`: cued **withholds** the target word (the learner must
 * produce it from the gloss), whereas free production **reveals** it (`lemma`/`pos`/`cefr`) — the
 * learner is asked to use that specific word in a sentence, and the rule layer requires its presence.
 */
export type ReviewPrompt =
  | { tier: "recognition"; senseId: string; mastery: MasteryState; meaning: string; options: string[] }
  | { tier: "cloze"; senseId: string; mastery: MasteryState; clozedSentence: string }
  | {
      tier: "cued";
      senseId: string;
      mastery: MasteryState;
      meaning: string;
      selfReferencePrompt: string | null;
    }
  | {
      tier: "free";
      senseId: string;
      mastery: MasteryState;
      lemma: string;
      pos: string;
      cefr: string | null;
      selfReferencePrompt: string | null;
    };

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

  const mastery = card.mastery;
  switch (tier) {
    case "recognition":
      return {
        tier,
        senseId,
        mastery,
        meaning: required(item.recognition_meaning, "recognition_meaning", item),
        options: assembleOptions(item),
      };
    case "cloze":
      return {
        tier,
        senseId,
        mastery,
        clozedSentence: required(item.clozed_sentence, "clozed_sentence", item),
      };
    case "cued":
      // Withholds the target word — the learner produces it from the productive gloss.
      return {
        tier,
        senseId,
        mastery,
        meaning: required(item.productive_meaning, "productive_meaning", item),
        selfReferencePrompt: item.self_reference_prompt,
      };
    case "free":
      // Reveals the target word — the learner is asked to use *this* word in a sentence.
      return {
        tier,
        senseId,
        mastery,
        lemma: item.lemma,
        pos: item.part_of_speech,
        cefr: item.cefr,
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
