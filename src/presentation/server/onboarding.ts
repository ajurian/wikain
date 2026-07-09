import { createServerFn } from "@tanstack/react-start";
import { seedIntroductions } from "../../application/seedIntroductions.js";
import {
  presentSeededWords,
  type SeededWordView,
} from "../../application/presentSeededWords.js";
import {
  judgeFirstProduction,
  type FirstProductionResult,
} from "../../application/judgeFirstProduction.js";
import { recordCoarseLevel } from "../../application/recordCoarseLevel.js";
import { completeOnboarding } from "../../application/completeOnboarding.js";
import { isCoarseLevel, type CoarseLevel } from "../../domain/placement/placement.js";
import { currentUserId } from "./currentUser.js";
import { seedingDeps, reviewDeps, placementProfileDeps } from "./composition.js";

/*
 * First-session-only server functions (spec/09 SEED-1). The re-runnable placement surface — reading the
 * profile, the coarse retune, LexTALE, the marking slate — lives in `placement.ts` (a different actor:
 * onboarding happens once, placement is re-runnable for the life of the account).
 */

export interface SeedFirstSessionInput {
  /** The coarse self-report from the level step. The BAND is derived server-side (SEED-2 policy). */
  level: CoarseLevel;
}

/**
 * Seed the new user's first-session introductions (spec/09 SEED-1/6) at the frontier band the onboarding
 * level step implies, and return the seeded words' display fields for the seeds + first-win screens.
 *
 * Takes the `CoarseLevel`, not a band string: the level→band map is spec policy (`frontierBandForCoarseLevel`,
 * SEED-2/5), so a client cannot nominate an arbitrary frontier. The band is PERSISTED here
 * (`recordCoarseLevel`) — every later session seeds at it, and `/settings` displays it.
 *
 * This is the ONLY place recording a coarse level also seeds. A retune (`setCoarseLevelFn`) must not, or
 * changing a setting would introduce a fresh batch of words as a side effect.
 *
 * No `placementKnown` is passed — the win comes BEFORE the "tune your level" step, so any word the learner
 * later flags known is consumed by the seeder from the shared marks store (SEED-7) on a subsequent session.
 * `userId` is resolved server-side (never trusted from the client).
 */
export const seedFirstSessionFn = createServerFn({ method: "POST" })
  .validator((input: unknown): SeedFirstSessionInput => {
    const o = input as Partial<SeedFirstSessionInput> | null;
    if (!o || !isCoarseLevel(o.level)) {
      throw new Error("seedFirstSessionFn: { level } must be one of 'b1' | 'b2' | 'c1'");
    }
    return { level: o.level };
  })
  .handler(async ({ data }): Promise<SeededWordView[]> => {
    const deps = seedingDeps();
    const userId = await currentUserId();
    const frontierBand = await recordCoarseLevel(
      { userId, level: data.level },
      placementProfileDeps(),
    );
    const seeded = await seedIntroductions({ userId, frontierBand }, deps);
    // Idempotent for a re-entered flow: a returning user (already carded) seeds nothing this call (SEED-6
    // pacing) — fall back to their earliest cards so the first-win screen still has a word to show.
    const cards =
      seeded.length > 0 ? seeded : (await deps.cards.listCards(userId)).slice(0, 2);
    return presentSeededWords(cards, deps.catalog);
  });

export interface JudgeFirstProductionFnInput {
  senseId: string;
  response: string;
  priorBounces?: number;
}

/**
 * The onboarding first-win judged production (spec/09 SEED-1): rule-screen + real judge, and NO
 * persistence (see `judgeFirstProduction` — a Seen word must not log a `free` review into the counter,
 * INV-4). The client calls `ruleCheckFn` first for the instant bounce (NET-2), so this is normally
 * reached only on a rule pass; it re-screens cheaply regardless. Reuses `reviewDeps()` (a structural
 * superset of the judge-only deps) so the same DeepSeek judge is used as in `/review`.
 */
export const judgeFirstProductionFn = createServerFn({ method: "POST" })
  .validator((input: unknown): JudgeFirstProductionFnInput => {
    const o = input as Partial<JudgeFirstProductionFnInput> | null;
    if (!o || typeof o.senseId !== "string" || typeof o.response !== "string") {
      throw new Error("judgeFirstProductionFn: { senseId, response } (strings) required");
    }
    return {
      senseId: o.senseId,
      response: o.response,
      priorBounces: typeof o.priorBounces === "number" ? o.priorBounces : 0,
    };
  })
  .handler(async ({ data }): Promise<FirstProductionResult> =>
    judgeFirstProduction(data, reviewDeps()),
  );

/**
 * Mark onboarding finished (spec/09 SEED-1) — the single fact the `_onboarded` route guard reads. Called
 * once, from the end of the tune step (whether the learner marked words, took LexTALE, or skipped both).
 * Idempotent in the use-case. POST (a write); `userId` is resolved server-side.
 */
export const completeOnboardingFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<void> => {
    await completeOnboarding({ userId: await currentUserId() }, placementProfileDeps());
  },
);
