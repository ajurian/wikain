import type { Card } from "../../domain/mastery/card.js";
import type { Cefr, ControlledPos } from "../../domain/lexicalItem.js";
import type { Catalog } from "../ports/catalog.js";

/** The onboarding view of a freshly-seeded word — the catalog fields the seeds + first-win screens show. */
export interface SeededWordView {
  senseId: string;
  lemma: string;
  pos: ControlledPos;
  cefr: Cefr;
  recognitionMeaning: string | null;
  selfReferencePrompt: string | null;
}

/**
 * Project freshly-seeded cards (spec/09 SEED-1) onto the catalog fields the onboarding screens render.
 * Fail-loud on a missing catalog entry: the seeder only ever creates cards for catalog words, so a miss
 * is a data bug, not a reachable user state (mirrors resolveReviewPrompt / readWordDetail's fail-loud on
 * a missing catalog row — as opposed to a missing card, which is a legitimate empty state elsewhere).
 */
export function presentSeededWords(cards: readonly Card[], catalog: Catalog): SeededWordView[] {
  return cards.map((card) => {
    const item = catalog.get(card.senseId);
    if (item === undefined) {
      throw new Error(`presentSeededWords: unknown sense_id ${card.senseId}`);
    }
    return {
      senseId: card.senseId,
      lemma: item.lemma,
      pos: item.part_of_speech,
      cefr: item.cefr,
      recognitionMeaning: item.recognition_meaning,
      selfReferencePrompt: item.self_reference_prompt,
    };
  });
}
