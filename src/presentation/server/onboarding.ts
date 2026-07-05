import { createServerFn } from "@tanstack/react-start";
import { seedIntroductions } from "../../application/seedIntroductions.js";
import { presentSeededWords, type SeededWordView } from "../../application/presentSeededWords.js";
import { readPlacementSlate, type PlacementSlateWord } from "../../application/readPlacementSlate.js";
import { recordPlacementMarks } from "../../application/recordPlacementMarks.js";
import {
  judgeFirstProduction,
  type FirstProductionResult,
} from "../../application/judgeFirstProduction.js";
import { currentUserId } from "./currentUser.js";
import { seedingDeps, reviewDeps, placementSlateDeps, recordMarksDeps } from "./composition.js";

/** How many frontier candidates the "tune your level" step offers to tap (a UI slate size). */
const PLACEMENT_SLATE_SIZE = 10;

export interface SeedFirstSessionInput {
  /** The catalog band the coarse level step chose (SEED-2/5, via `frontierBandForCoarseLevel`). */
  frontierBand: string;
}

/**
 * Seed the new user's first-session introductions (spec/09 SEED-1/6) at the coarse frontier band the
 * onboarding level step chose, and return the seeded words' display fields for the seeds + first-win
 * screens. No `placementKnown` is passed here — the win comes BEFORE the "tune your level" step, so any
 * word the learner later flags known is consumed by the seeder from the shared marks store (SEED-7) on
 * a subsequent session. `userId` is resolved server-side (never trusted from the client).
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

/**
 * The frontier candidates the "tune your level" step offers for placement marking (spec/09 SEED-2).
 * A pure read (never seeds/marks): reuses the same list-stack word source the seeder selects from,
 * excluding words the user already has a card for (SEED-7). GET + a `frontierBand` validator, mirroring
 * `wordDetailFn`. `userId` is resolved server-side.
 */
export const placementSlateFn = createServerFn({ method: "GET" })
  .validator((frontierBand: unknown): string => {
    if (typeof frontierBand !== "string" || frontierBand.length === 0) {
      throw new Error("placementSlateFn: frontierBand (non-empty string) required");
    }
    return frontierBand;
  })
  .handler(async ({ data }): Promise<PlacementSlateWord[]> =>
    readPlacementSlate(
      { userId: currentUserId(), frontierBand: data, count: PLACEMENT_SLATE_SIZE },
      placementSlateDeps(),
    ),
  );

export interface RecordPlacementMarksFnInput {
  senseIds: string[];
}

/**
 * Persist the senseIds the learner flagged placement-known in onboarding (spec/09 SEED-2). Idempotent
 * + additive; its sole later effect is that `seedIntroductions` enters a marked word at `Recognized`
 * (SEED-7 / SM-11) when the pacer reaches it. `userId` is resolved server-side. POST (a write).
 */
export const recordPlacementMarksFn = createServerFn({ method: "POST" })
  .validator((input: unknown): RecordPlacementMarksFnInput => {
    const o = input as Partial<RecordPlacementMarksFnInput> | null;
    if (!o || !Array.isArray(o.senseIds) || o.senseIds.some((s) => typeof s !== "string")) {
      throw new Error("recordPlacementMarksFn: { senseIds: string[] } required");
    }
    return { senseIds: o.senseIds };
  })
  .handler(async ({ data }): Promise<void> => {
    await recordPlacementMarks({ userId: currentUserId(), senseIds: data.senseIds }, recordMarksDeps());
  });
