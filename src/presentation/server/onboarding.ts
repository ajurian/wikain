import { createServerFn } from "@tanstack/react-start";
import { seedIntroductions } from "../../application/seedIntroductions.js";
import { presentSeededWords, type SeededWordView } from "../../application/presentSeededWords.js";
import {
  judgeFirstProduction,
  type FirstProductionResult,
} from "../../application/judgeFirstProduction.js";
import { currentUserId } from "./currentUser.js";
import { seedingDeps, reviewDeps } from "./composition.js";

export interface SeedFirstSessionInput {
  /** The catalog band the coarse level step chose (SEED-2/5, via `frontierBandForCoarseLevel`). */
  frontierBand: string;
}

/**
 * Seed the new user's first-session introductions (spec/09 SEED-1/6) at the coarse frontier band the
 * onboarding level step chose, and return the seeded words' display fields for the seeds + first-win
 * screens. Placement-known marking (SEED-2/3) is deferred — it needs a per-user placement-marks store
 * (arrives with per-user state / BetterAuth), so no `placementKnown` is passed and every first-session
 * word enters at `Seen` (SM-11). `userId` is resolved server-side (never trusted from the client).
 */
export const seedFirstSessionFn = createServerFn({ method: "POST" })
  .validator((input: unknown): SeedFirstSessionInput => {
    const o = input as Partial<SeedFirstSessionInput> | null;
    if (!o || typeof o.frontierBand !== "string" || o.frontierBand.length === 0) {
      throw new Error("seedFirstSessionFn: { frontierBand } (non-empty string) required");
    }
    return { frontierBand: o.frontierBand };
  })
  .handler(async ({ data }): Promise<SeededWordView[]> => {
    const deps = seedingDeps();
    const userId = currentUserId();
    const seeded = await seedIntroductions({ userId, frontierBand: data.frontierBand }, deps);
    // Idempotent for the dev demo: a returning user (already carded) seeds nothing this call (SEED-6
    // pacing) — fall back to their earliest cards so the first-win screen still has a word to show.
    const cards = seeded.length > 0 ? seeded : (await deps.cards.listCards(userId)).slice(0, 2);
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
 * superset of the judge-only deps) so the same key-gated judge (DeepSeek / dev) is used as in `/review`.
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
  .handler(async ({ data }): Promise<FirstProductionResult> => judgeFirstProduction(data, reviewDeps()));
