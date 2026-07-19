import { orderSessionQueue } from "~/domain/scheduling/sessionQueue.js";
import {
  buildBatch,
  tierCounts,
  type BatchQueueEntry,
} from "~/domain/scheduling/batch.js";
import { evaluateSeedRail } from "~/domain/scheduling/seedRail.js";
import { resolveReviewTier } from "~/domain/review/reviewRouting.js";
import type { ReviewTier } from "~/domain/review/review.js";
import type {
  ActiveSessionState,
  SessionStateStore,
} from "../ports/sessionState.js";
import type { SeedLedgerStore } from "../ports/seedLedger.js";
import type { SeedInstrumentationStore } from "../ports/seedInstrumentation.js";
import type { BatchInstrumentationStore } from "../ports/batchInstrumentation.js";
import {
  seedIntroductions,
  type SeedIntroductionsDeps,
} from "./seedIntroductions.js";

export interface BuildSessionBatchInput {
  userId: string;
  /** SEED-2/5: the persisted frontier band seeding selects at (when the day-guard lets it run). */
  frontierBand: string;
  /** The learner's UTC offset for the BAT-14 day key — resolved at the composition edge (CNT-2). */
  utcOffsetMinutes: number;
  /** BAT-16: ordinal of the batch being built, 1-based within its session. */
  batchNumber: number;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
}

export interface BuildSessionBatchDeps extends SeedIntroductionsDeps {
  sessionState: SessionStateStore;
  seedLedger: SeedLedgerStore;
  seedInstrumentation: SeedInstrumentationStore;
  batches: BatchInstrumentationStore;
  /**
   * DEV ONLY — the same `WIKAIN_DEV_TIER` pin `runReviewPass`/`resolveReviewPrompt` receive, injected
   * from the same composition root: the batcher weighs entries by tier, so an unpinned batcher under
   * a pinned grader would budget recognition-weight batches full of free-production cards.
   */
  tierOverride?: ReviewTier;
  /** Batch-id source; defaults to `crypto.randomUUID` at the composition edge (deterministic tests). */
  idFactory?: () => string;
}

export type BuildSessionBatchResult =
  | { kind: "batch"; state: ActiveSessionState }
  /** Nothing due — there is no active batch (any prior state row is cleared). */
  | { kind: "empty" };

/**
 * Build and persist a fresh active batch over the CURRENT due state (spec/14 BAT-4/10/14/16) — the
 * shared builder behind session start, the seam's Continue, and the BAT-13 expiry rebuild. Each call
 * re-reads due cards and re-resolves every tier via the one shared router (`resolveReviewTier`), so
 * mid-session newly-due cards join here and never mutate an active batch (BAT-10).
 *
 * Seeding rail (spec/09 SEED-10, refining BAT-14): a seed batch is granted iff BOTH the learner-local
 * calendar day has rolled since `last_seed_at` AND at least `SEED_MIN_GAP_HOURS` have elapsed since it.
 * The gap clause is what blocks the 11:50pm→12:00am boundary-burst the calendar-day clause alone
 * permits. On a grant the pass stamps `last_seed_at = now` (even when pacing admitted 0 intros, as
 * before) and logs the grant; on a denial it logs the failing clause (SEED-14). The per-day cumulative
 * count cap stays Deferred.
 */
export async function buildSessionBatch(
  input: BuildSessionBatchInput,
  deps: BuildSessionBatchDeps,
): Promise<BuildSessionBatchResult> {
  const { userId } = input;
  const now = input.now ?? new Date();

  // SEED-10: grant a seed iff there is daily headroom under the NEW_PER_DAY count cap AND — only when
  // crossing a learner-local calendar-day boundary — the SEED_MIN_GAP_HOURS gap has elapsed (the gap
  // blocks the 11:50pm→12:00am double). Within a day the cap alone bounds intros, so a partial or
  // backlog-throttled seed no longer burns the day. The rule is the pure `evaluateSeedRail`, shared
  // with the dashboard read-model so the count it shows is the count this builder will actually seed.
  const ledger = await deps.seedLedger.read(userId);
  const { introducedToday, dailyRemaining, granted, failingClause } =
    evaluateSeedRail({
      lastSeedAt: ledger?.lastSeedAt,
      seededCount: ledger?.seededCount ?? 0,
      now,
      utcOffsetMinutes: input.utcOffsetMinutes,
    });

  let seededSenseIds: string[] = [];
  if (granted) {
    const seeded = await seedIntroductions(
      {
        userId,
        frontierBand: input.frontierBand,
        maxIntroductions: dailyRemaining,
        now,
      },
      deps,
    );
    seededSenseIds = seeded.map((c) => c.senseId);
    // SEED-11: advance the ledger ONLY when a card was actually introduced. A zero-intro pass (pace
    // zeroed by backlog, or the frontier exhausted) is a no-op — it must not stamp/burn the day.
    if (seeded.length > 0) {
      await deps.seedLedger.record(userId, now, introducedToday + seeded.length);
    }
  } else {
    // SEED-14 precedence: `daily_cap` is the ordinary same-day denial (today's NEW_PER_DAY spent);
    // `min_gap` fires only when the day rolled with headroom but the gap was short — exactly the
    // boundary-burst the gap clause catches.
    await deps.seedInstrumentation.recordDenial({
      userId,
      at: now,
      failingClause: failingClause ?? "daily_cap",
    });
  }

  const all = await deps.cards.listCards(userId);
  const queue = orderSessionQueue(all, seededSenseIds, now);

  if (seededSenseIds.length > 0) {
    // SEED-14: log the grant only when it actually introduced cards (a granted-but-zero pass advanced
    // nothing and is not a rail bind). Backlog state: any queued card NOT just seeded is existing debt.
    const seededSet = new Set(seededSenseIds);
    await deps.seedInstrumentation.recordGrant({
      userId,
      seededAt: now,
      count: seededSenseIds.length,
      hadBacklog: queue.some((senseId) => !seededSet.has(senseId)),
    });
  }

  if (queue.length === 0) {
    await deps.sessionState.clear(userId);
    return { kind: "empty" };
  }

  // BAT-2: tag each queued card with its resolved tier — the SAME router the prompt and the grader
  // use, so the batcher never invents a parallel heuristic. Only `Seen` consults logs (SM-3/RAT-7).
  const byId = new Map(all.map((c) => [c.senseId, c]));
  const entries: BatchQueueEntry[] = [];
  for (const senseId of queue) {
    const card = byId.get(senseId);
    if (card === undefined) continue; // queue is derived from `all` — structurally unreachable
    const logs =
      card.mastery === "Seen"
        ? await deps.cards.logsForWord(userId, senseId)
        : [];
    const tier = deps.tierOverride ?? resolveReviewTier(card.mastery, logs);
    entries.push({ senseId, tier });
  }

  const built = buildBatch(entries);
  const batchId = (deps.idFactory ?? crypto.randomUUID.bind(crypto))();
  const state: ActiveSessionState = {
    userId,
    batchId,
    batchNumber: input.batchNumber,
    entries: built.entries,
    progressIndex: 0,
    startedAt: now,
    lastInteractionAt: now,
  };
  await deps.sessionState.save(state);
  await deps.batches.create({
    batchId,
    userId,
    batchNumber: input.batchNumber,
    plannedTierCounts: tierCounts(built.entries),
    plannedUnits: built.plannedUnits,
    plannedCards: built.entries.length,
    builtAt: now,
  });
  return { kind: "batch", state };
}
