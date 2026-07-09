import type { Card } from "../domain/mastery/card.js";
import { introductionState } from "../domain/mastery/entryState.js";
import { newIntroductionsAllowed } from "../domain/scheduling/introductionPacing.js";
import { coldStartDifficulty } from "../domain/scheduling/coldStart.js";
import type { Catalog } from "./ports/catalog.js";
import type { WordSource } from "./ports/wordSource.js";
import type { CardRepository } from "./ports/cardRepository.js";
import type { Scheduler } from "./ports/scheduler.js";
import type { PlacementMarksStore } from "./ports/placementMarks.js";

export interface SeedIntroductionsInput {
  userId: string;
  /** SEED-2/5: the frontier band (a LexTALE-scalar-derived level); the list stack picks words here. */
  frontierBand: string;
  /**
   * SEED-2/3: per-word placement-known flags — the ONLY input that skips `Seen` (SM-11). Separate
   * from the frontier band (which never marks words, SEED-3). An explicit set here overrides the
   * `marks` store (used by tests); when absent, the user's persisted marks are consulted instead
   * (`deps.marks`), or no word skips `Seen` if neither is provided.
   */
  placementKnown?: ReadonlySet<string>;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
}

export interface SeedIntroductionsDeps {
  catalog: Catalog;
  wordSource: WordSource;
  cards: CardRepository;
  scheduler: Scheduler;
  /**
   * SEED-7: the user's persisted placement marks. Optional so unit tests can pass `placementKnown`
   * directly without a store; the real wirings inject it so a word marked known in onboarding lazily
   * cards at `Recognized` when the pacer reaches it. Consulted only when `input.placementKnown` is
   * absent.
   */
  marks?: PlacementMarksStore;
}

const EMPTY: ReadonlySet<string> = new Set();

/**
 * SEED-1/6/7 + SM-11: introduce (lazily create cards for) the next batch of frontier words for a user.
 *  - Pacing (SEED-6): first-session vs steady-state, capped under a due backlog so reviews never
 *    starve — computed by the pure `newIntroductionsAllowed`.
 *  - Selection (SEED-2/5): the list-stack `WordSource` picks the frontier words, excluding those the
 *    user already has cards for (SEED-7: an un-introduced word has no card until the pacer reaches it).
 *  - Entry state (SM-11): a placement-known word enters `Recognized`; all others `Seen` (SEED-3: the
 *    frontier band never marks a word known).
 *  - Cold-start (SEED-8): each new card carries the CEFR×band difficulty estimate.
 *
 * Reuses the existing `CardRepository` (`listCards`/`save`) — no new persistence method. Returns the
 * cards created this call (empty when the pace allows none or the frontier is exhausted).
 */
export async function seedIntroductions(
  input: SeedIntroductionsInput,
  deps: SeedIntroductionsDeps,
): Promise<Card[]> {
  const { userId, frontierBand } = input;
  const now = input.now ?? new Date();
  // SEED-7: an explicit set wins (tests); otherwise consult the user's persisted marks; else none.
  const known: ReadonlySet<string> =
    input.placementKnown ?? (deps.marks ? new Set(await deps.marks.list(userId)) : EMPTY);

  const existing = await deps.cards.listCards(userId);
  const isFirstSession = existing.length === 0;
  const dueBacklog = existing.filter((c) => c.fsrs.due.getTime() <= now.getTime()).length;

  const allowed = newIntroductionsAllowed({ isFirstSession, dueBacklog });
  if (allowed <= 0) return [];

  const exclude = new Set(existing.map((c) => c.senseId));
  const senseIds = await deps.wordSource.nextFrontierWords(frontierBand, exclude, allowed);

  const created: Card[] = [];
  for (const senseId of senseIds) {
    const item = deps.catalog.get(senseId);
    // The word source selects from the same catalog; a miss is a wiring inconsistency — halt, don't
    // guess (mirrors the build pipeline's fail-loud stance).
    if (!item) throw new Error(`seedIntroductions: word source returned unknown senseId ${senseId}`);

    const fsrs = deps.scheduler.newCard(now, {
      difficulty: coldStartDifficulty(item.cefr),
    });
    const card: Card = {
      userId,
      senseId,
      mastery: introductionState(known.has(senseId)),
      fsrs,
    };
    await deps.cards.save(card);
    created.push(card);
  }
  return created;
}
