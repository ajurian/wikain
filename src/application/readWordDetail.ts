import { distinctPassDays } from "../domain/judgedPassLedger.js";
import { isCounted } from "../domain/counter.js";
import { COUNTER_R_FLOOR } from "../domain/constants.js";
import { deriveMasteryHistory, type MasteryHistoryEntry } from "../domain/masteryHistory.js";
import type { MasteryState } from "../domain/card.js";
import type { CardRepository } from "./ports/cardRepository.js";
import type { Scheduler } from "./ports/scheduler.js";
import type { Catalog } from "./ports/catalog.js";

export interface ReadWordDetailInput {
  userId: string;
  senseId: string;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
  /** CNT-2 day boundary; per-user tz is seeding-deferred, so default UTC (0). */
  utcOffsetMinutes?: number;
}

export interface ReadWordDetailDeps {
  cards: CardRepository;
  scheduler: Scheduler;
  catalog: Catalog;
}

/** Per-word detail (`/words/$wordId`). `null` catalog fields are tolerated (DM-4) — the surface guards. */
export interface WordDetail {
  senseId: string;
  lemma: string;
  pos: string;
  cefr: string | null;
  recognitionMeaning: string | null;
  modelSentence: string | null;
  mastery: MasteryState;
  /** Live retrievability at read time (CNT-3), in [0,1]. */
  retrievability: number;
  aboveFloor: boolean;
  counted: boolean;
  judgedPassDays: number;
  /** Promotions and demotions at equal weight (CNT-1), oldest-first; sentence text is not persisted (v1). */
  history: MasteryHistoryEntry[];
}

/**
 * The per-word detail read-model (spec/10 CNT-1/2/3, spec/01 SM-3..SM-7 via the history replay). A pure
 * read over the card + its ReviewLogs + the catalog. Returns `null` when the user has no card for the
 * word (a legitimate not-found — any senseId is a reachable URL); a missing *catalog* entry is instead a
 * fail-loud data-integrity error (mirrors resolveReviewPrompt). Never writes, rates, or schedules.
 */
export async function readWordDetail(
  input: ReadWordDetailInput,
  deps: ReadWordDetailDeps,
): Promise<WordDetail | null> {
  const now = input.now ?? new Date();
  const offset = input.utcOffsetMinutes ?? 0;
  const { userId, senseId } = input;

  const card = await deps.cards.load(userId, senseId);
  if (card === undefined) return null;

  const item = deps.catalog.get(senseId);
  if (item === undefined) {
    throw new Error(`readWordDetail: no catalog item for sense ${senseId}`);
  }

  const logs = await deps.cards.logsForWord(userId, senseId);
  const passDays = distinctPassDays(logs, offset);
  const retrievability = deps.scheduler.getRetrievability(card.fsrs, now);

  return {
    senseId,
    lemma: item.lemma,
    pos: item.part_of_speech,
    cefr: item.cefr,
    recognitionMeaning: item.recognition_meaning,
    modelSentence: item.model_sentence,
    mastery: card.mastery,
    retrievability,
    aboveFloor: retrievability >= COUNTER_R_FLOOR,
    counted: isCounted({ passDays, retrievability }),
    judgedPassDays: passDays,
    history: deriveMasteryHistory(logs, offset),
  };
}
