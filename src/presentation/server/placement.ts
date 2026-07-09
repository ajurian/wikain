import { createServerFn } from "@tanstack/react-start";
import {
  readPlacementSlate,
  type PlacementSlateWord,
} from "~/application/placement/readPlacementSlate.js";
import { recordPlacementMarks } from "~/application/placement/recordPlacementMarks.js";
import { readPlacementProfile } from "~/application/placement/readPlacementProfile.js";
import { recordCoarseLevel } from "~/application/placement/recordCoarseLevel.js";
import { recordLexTaleResult, type LexTaleResult } from "~/application/placement/recordLexTaleResult.js";
import { isCoarseLevel, type CoarseLevel } from "~/domain/placement/placement.js";
import { LEXTALE_ITEMS } from "~/domain/placement/lextale.js";
import type { PlacementProfile } from "~/domain/placement/placementProfile.js";
import { currentUserId } from "./currentUser.js";
import { placementSlateDeps, recordMarksDeps, placementProfileDeps } from "./composition.js";

/**
 * Placement (spec/09 SEED-2/3/4) — the server functions that read and change WHERE the learner's frontier
 * sits, plus the per-word marking pair. Split out of `onboarding.ts` (slice 23) because they answer to a
 * different actor: onboarding runs once, placement is re-runnable for the life of the account (`/placement`).
 * What stayed behind there is genuinely first-session-only: seeding, the first-win judge, the completion stamp.
 *
 * NONE of these seed. `seedFirstSessionFn` deliberately bundles `recordCoarseLevel` WITH `seedIntroductions`
 * for the first session; calling it from a retune would introduce a fresh batch of words as a side effect of
 * changing a setting. `setCoarseLevelFn` below is the band-only path.
 */

/** How many frontier candidates the "tune your level" step offers to tap (a UI slate size). */
const PLACEMENT_SLATE_SIZE = 10;

/** The learner's persisted placement (spec/09 SEED-2/4) — the band + LexTALE scalar `/settings` displays. */
export const readPlacementProfileFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlacementProfile> =>
    readPlacementProfile({ userId: await currentUserId() }, placementProfileDeps()),
);

export interface SetCoarseLevelFnInput {
  level: CoarseLevel;
}

/**
 * Re-set the frontier band from a coarse self-report (spec/09 SEED-2 mechanism (i)) — the `/placement`
 * retune's quick path, and the one SEED-4 explicitly sanctions for a self-aware learner.
 *
 * Band ONLY: it does not seed (cf. `seedFirstSessionFn`), does not mark words (SEED-3), and does not touch
 * existing cards — the new band changes only what `WordSource.nextFrontierWords` selects NEXT. Clearing the
 * now-stale LexTALE scalar happens inside `recordCoarseLevel`. Returns the new band.
 */
export const setCoarseLevelFn = createServerFn({ method: "POST" })
  .validator((input: unknown): SetCoarseLevelFnInput => {
    const o = input as Partial<SetCoarseLevelFnInput> | null;
    if (!o || !isCoarseLevel(o.level)) {
      throw new Error("setCoarseLevelFn: { level } must be one of 'b1' | 'b2' | 'c1'");
    }
    return { level: o.level };
  })
  .handler(async ({ data }): Promise<string> =>
    recordCoarseLevel({ userId: await currentUserId(), level: data.level }, placementProfileDeps()),
  );

/** The learner's raw yes/no answers, keyed by published LexTALE item. `true` = "I know this word". */
export interface SubmitLexTaleFnInput {
  answers: Record<string, boolean>;
}

/**
 * Score a completed LexTALE run and persist the scalar + the band it implies (spec/09 SEED-2/3/4).
 *
 * The client posts ANSWERS, never a score: the scalar moves the learner's frontier band, so scoring stays
 * server-side (`recordLexTaleResult` → `scoreLexTale`). The validator additionally requires the answer set
 * to be exactly the 60 published items — a short or padded run is rejected before anything is written,
 * rather than yielding a quietly-skewed placement.
 */
export const submitLexTaleFn = createServerFn({ method: "POST" })
  .validator((input: unknown): SubmitLexTaleFnInput => {
    const o = input as Partial<SubmitLexTaleFnInput> | null;
    const answers = o?.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      throw new Error("submitLexTaleFn: { answers: Record<string, boolean> } required");
    }
    const keys = Object.keys(answers);
    if (keys.length !== LEXTALE_ITEMS.length) {
      throw new Error(
        `submitLexTaleFn: expected ${LEXTALE_ITEMS.length} answers, got ${keys.length}`,
      );
    }
    if (keys.some((k) => typeof answers[k] !== "boolean")) {
      throw new Error("submitLexTaleFn: every answer must be a boolean");
    }
    return { answers };
  })
  .handler(async ({ data }): Promise<LexTaleResult> =>
    // `scoreLexTale` is the real gate on item identity: it throws on a missing OR unrecognized item, so a
    // 60-key payload of the wrong 60 items still cannot persist a scalar.
    recordLexTaleResult(
      { userId: await currentUserId(), answers: new Map(Object.entries(data.answers)) },
      placementProfileDeps(),
    ),
  );

/**
 * The frontier candidates the "tune your level" step offers for placement marking (spec/09 SEED-2).
 * A pure read (never seeds/marks): reuses the same list-stack word source the seeder selects from,
 * excluding words the user already has a card for (SEED-7).
 *
 * Takes NO band argument — it reads the learner's persisted `frontierBand`, so the slate always matches
 * where they were actually placed (including a retune by LexTALE), and no client can steer the selection.
 */
export const placementSlateFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlacementSlateWord[]> => {
    const userId = await currentUserId();
    const { frontierBand } = await readPlacementProfile({ userId }, placementProfileDeps());
    return readPlacementSlate(
      { userId, frontierBand, count: PLACEMENT_SLATE_SIZE },
      placementSlateDeps(),
    );
  },
);

export interface RecordPlacementMarksFnInput {
  senseIds: string[];
}

/**
 * Persist the senseIds the learner flagged placement-known in onboarding (spec/09 SEED-2). Idempotent
 * + additive; its sole later effect is that `seedIntroductions` enters a marked word at `Recognized`
 * (SEED-7 / SM-11) when the pacer reaches it. `userId` is resolved server-side. POST (a write).
 *
 * Not offered by `/placement`: marks are additive-only (v1 has no un-mark), so a mistaken tap outside the
 * onboarding context would be permanent.
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
    await recordPlacementMarks(
      { userId: await currentUserId(), senseIds: data.senseIds },
      recordMarksDeps(),
    );
  });
