import type { Cefr, ControlledPos } from "../../domain/lexicalItem.js";
import type { Catalog } from "../ports/catalog.js";
import type { WordSource } from "../ports/wordSource.js";
import type { CardRepository } from "../ports/cardRepository.js";

/** One candidate word offered for placement marking (spec/09 SEED-2) — the fields the chip renders. */
export interface PlacementSlateWord {
  senseId: string;
  lemma: string;
  pos: ControlledPos;
  cefr: Cefr;
}

export interface ReadPlacementSlateInput {
  userId: string;
  /** SEED-2/5: the frontier band the coarse level chose — the slate is drawn from here. */
  frontierBand: string;
  /** How many candidate words to offer (a UI slate size, not a spec tunable). */
  count: number;
}

export interface ReadPlacementSlateDeps {
  wordSource: WordSource;
  cards: CardRepository;
  catalog: Catalog;
}

/**
 * The candidate words the onboarding "tune your level" step offers for placement marking (spec/09
 * SEED-2). Reuses the same list-stack `WordSource` the seeder selects from, excluding words the user
 * already has a card for (SEED-7 — a marked word only matters before the pacer reaches it, so an
 * already-carded word is a no-op mark). A pure read: it NEVER creates cards or records marks (SEED-3).
 *
 * Fail-loud on a missing catalog entry (mirrors `presentSeededWords`): the word source selects from the
 * same catalog, so a miss is a wiring bug, not a reachable state.
 */
export async function readPlacementSlate(
  input: ReadPlacementSlateInput,
  deps: ReadPlacementSlateDeps,
): Promise<PlacementSlateWord[]> {
  const carded = await deps.cards.listCards(input.userId);
  const exclude = new Set(carded.map((c) => c.senseId));
  const senseIds = await deps.wordSource.nextFrontierWords(input.frontierBand, exclude, input.count);

  return senseIds.map((senseId) => {
    const item = deps.catalog.get(senseId);
    if (item === undefined) {
      throw new Error(`readPlacementSlate: word source returned unknown senseId ${senseId}`);
    }
    return { senseId, lemma: item.lemma, pos: item.part_of_speech, cefr: item.cefr };
  });
}
