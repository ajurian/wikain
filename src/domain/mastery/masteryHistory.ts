import type { MasteryState } from "./card.js";
import type { ReviewLog, ReviewTier } from "../review/review.js";
import {
  promoteOnClozePass,
  promoteOnCuedPass,
  promoteOnJudgedPass,
  demoteOneRung,
} from "./mastery.js";
import { qualifiesForFluent } from "./fluentGate.js";
import { localDayKey } from "./judgedPassLedger.js";

/**
 * A per-word review-history timeline for the `/words/$wordId` detail (spec/01 SM-3..SM-7). Derived
 * purely by **replaying** the persisted ReviewLogs through the same mastery transitions the real pass
 * uses (`mastery.ts` + `fluentGate.ts`) — one source of truth, no new rules (PRAG-3) and no drift from
 * a stored transition. The free-production *sentence text* is deliberately absent: it is not persisted
 * on `ReviewLog` (DM-6), so v1 shows the move, not the words (memo work DM-8/MEMO-1 adds it later).
 */

/** A mastery ladder move a single review produced. */
export interface MasteryMove {
  from: MasteryState;
  to: MasteryState;
}

/** One review, projected for display (newest-first ordering is the caller's concern). */
export interface MasteryHistoryEntry {
  /** User-local calendar day `YYYY-MM-DD` (same boundary convention as the ledger). */
  day: string;
  tier: ReviewTier;
  /** A rule-layer bounce writes no log (INV-2), so the only outcomes on record are pass/fail. */
  outcome: "pass" | "fail";
  /** Present only when this review changed the mastery rung (promotion or demotion, equal weight). */
  moved?: MasteryMove;
}

/**
 * The mastery a word held *before* its first persisted review, inferred from that review's tier — the
 * tier is the routing output of the mastery at review time (`reviewRouting.ts`): the two `Seen`
 * on-ramp tiers imply `Seen`, `cued` implies `Recognized`, and `free` implies `Productive` (a card
 * seeded `Recognized` first shows `cued`, so the earliest `free` log is always entered from Productive).
 */
function initialStateFromTier(tier: ReviewTier): MasteryState {
  switch (tier) {
    case "recognition":
    case "cloze":
      return "Seen";
    case "cued":
      return "Recognized";
    case "free":
      return "Productive";
  }
}

/**
 * Apply one review's transition. Deterministic-tier fails never demote (SM-6) — only a judged-gate
 * fail does (SM-7). A recognition MCQ pass alone never promotes (SM-3). `passDays` is the running
 * count of distinct judged-pass days *including* this review, so the Fluent gate (SM-5) sees the same
 * ledger the live promotion did.
 */
function applyTransition(
  state: MasteryState,
  log: ReviewLog,
  passed: boolean,
  passDays: number,
): MasteryState {
  switch (log.tier) {
    case "recognition":
      return state;
    case "cloze":
      return promoteOnClozePass(state, passed);
    case "cued":
      return passed ? promoteOnCuedPass(state) : state;
    case "free":
      if (!passed) return demoteOneRung(state);
      return promoteOnJudgedPass(
        state,
        qualifiesForFluent({
          passDays,
          stability: log.fsrs.stability,
          mostRecentScaffolded: log.scaffolded ?? false,
        }),
      );
  }
}

export function deriveMasteryHistory(
  logs: readonly ReviewLog[],
  utcOffsetMinutes = 0,
): MasteryHistoryEntry[] {
  if (logs.length === 0) return [];

  // Replay oldest→newest. logsForWord returns append-order (chronological), but sort defensively so
  // the pure helper does not depend on caller ordering.
  const ordered = [...logs].sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime());

  let state = initialStateFromTier(ordered[0]!.tier);
  const judgedPassDays = new Set<string>();
  const entries: MasteryHistoryEntry[] = [];

  for (const log of ordered) {
    const passed = log.rating === "Good";
    const before = state;
    const day = localDayKey(log.reviewedAt, utcOffsetMinutes);

    // Count this judged pass before applying the transition — the live Fluent gate includes it.
    if (log.tier === "free" && passed) judgedPassDays.add(day);

    state = applyTransition(before, log, passed, judgedPassDays.size);

    entries.push({
      day,
      tier: log.tier,
      outcome: passed ? "pass" : "fail",
      moved: state !== before ? { from: before, to: state } : undefined,
    });
  }

  return entries;
}
