import { createServerFn } from "@tanstack/react-start";
import { runReviewPass, reviewWasRated } from "~/application/review/runReviewPass.js";
import { resolveReviewPrompt } from "~/application/review/resolveReviewPrompt.js";
import { checkFreeProductionRuleLayer } from "~/application/review/checkFreeProductionRuleLayer.js";
import {
  presentReviewOutcome,
  type ReviewOutcomeView,
} from "~/application/review/presentReviewOutcome.js";
import {
  getOrResumeSession,
  type GetOrResumeSessionResult,
  type SessionFraming,
} from "~/application/session/getOrResumeSession.js";
import { advanceActiveBatch, type BatchProgress } from "~/application/session/advanceActiveBatch.js";
import { skipActiveBatchCard } from "~/application/session/skipActiveBatchCard.js";
import {
  recordSeamChoice,
  type RecordSeamChoiceResult,
} from "~/application/session/recordSeamChoice.js";
import { readSettings } from "~/application/readSettings.js";
import { utcOffsetMinutesFor } from "~/domain/timezone.js";
import type { RuleBounceReason } from "~/domain/review/ruleLayer.js";
import type { ClozeSoftBounceLane } from "~/domain/review/clozeFitSet.js";
import { readPlacementProfile } from "~/application/placement/readPlacementProfile.js";
import { currentUserId } from "./currentUser.js";
import {
  batchProgressDeps,
  placementProfileDeps,
  promptDeps,
  reviewDeps,
  sessionFlowDeps,
  settingsDeps,
} from "./composition.js";

/**
 * The serializable batch view the client walks (spec/14 BAT-11). `senseIds` is the ACTIVE batch only
 * — never the whole queue — and tiers stay server-side (the client learns each card's shape from
 * `resolvePromptFn`, the single prompt source). `completed` is the logged-rating count (BAT-7).
 */
export type SessionView =
  | {
      kind: "batch";
      framing: SessionFraming;
      batchId: string;
      batchNumber: number;
      senseIds: string[];
      completed: number;
      total: number;
    }
  | { kind: "seam"; batchId: string; batchNumber: number; total: number }
  | { kind: "empty" }
  /** The learner chose Done at the seam — the session is over (BAT-9). */
  | { kind: "done" };

function toSessionView(result: GetOrResumeSessionResult | RecordSeamChoiceResult): SessionView {
  switch (result.kind) {
    case "batch":
      return {
        kind: "batch",
        framing: "framing" in result ? result.framing : "fresh",
        batchId: result.state.batchId,
        batchNumber: result.state.batchNumber,
        senseIds: result.state.entries.map((e) => e.senseId),
        completed: result.state.progressIndex,
        total: result.state.entries.length,
      };
    case "seam":
      return {
        kind: "seam",
        batchId: result.state.batchId,
        batchNumber: result.state.batchNumber,
        total: result.state.entries.length,
      };
    case "empty":
      return { kind: "empty" };
    case "done":
      return { kind: "done" };
  }
}

/**
 * The per-user inputs every session write needs: the persisted frontier band (SEED-2 — it used to be
 * a hardcoded "B2", which silently discarded the level the learner chose) and the learner-local UTC
 * offset for the BAT-14 day key, resolved at this composition edge (the CNT-2 pattern).
 */
async function sessionContext(userId: string, now: Date) {
  const { frontierBand } = await readPlacementProfile({ userId }, placementProfileDeps());
  const { timezone } = await readSettings({ userId }, settingsDeps());
  return { frontierBand, utcOffsetMinutes: utcOffsetMinutesFor(timezone, now) };
}

/**
 * The single session entry point (spec/14 BAT-11/12/13): every arrival — navigation, reload, cold
 * start — resolves through the same server-side two-branch check. POST because it writes: it may
 * seed (day-guarded, BAT-14), finalize a stale batch, and persist a fresh one. Secrets/DB stay
 * server-side (NET-7/STACK-4).
 */
export const getReviewSessionFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<SessionView> => {
    const userId = await currentUserId();
    const now = new Date();
    const ctx = await sessionContext(userId, now);
    const result = await getOrResumeSession({ userId, ...ctx, now }, sessionFlowDeps());
    return toSessionView(result);
  },
);

/**
 * BAT-8: remove the batch's current card after a terminal no-rating skip (the RL-6 capped
 * reveal+skip, or the NET-3 unavailable state's skip). The card stays due and unrated — this only
 * shrinks the presentation denominator so the bar cannot stall short of N.
 */
export const skipCardFn = createServerFn({ method: "POST" })
  .validator((senseId: unknown): string => {
    if (typeof senseId !== "string" || senseId.length === 0) {
      throw new Error("skipCardFn: senseId (non-empty string) required");
    }
    return senseId;
  })
  .handler(async ({ data }): Promise<BatchProgress | null> => {
    const userId = await currentUserId();
    const res = await skipActiveBatchCard({ userId, senseId: data }, batchProgressDeps());
    return res.active ? res.progress : null;
  });

/**
 * BAT-9: the explicit Continue/Done at the completion seam. Continue builds the next batch over the
 * remaining due queue (BAT-10; same-day → no re-seed, BAT-14); Done ends the session.
 */
export const seamChoiceFn = createServerFn({ method: "POST" })
  .validator((input: unknown): "continue" | "done" => {
    const o = input as { choice?: unknown } | null;
    if (o?.choice !== "continue" && o?.choice !== "done") {
      throw new Error('seamChoiceFn: { choice: "continue" | "done" } required');
    }
    return o.choice;
  })
  .handler(async ({ data }): Promise<SessionView> => {
    const userId = await currentUserId();
    const now = new Date();
    const ctx = await sessionContext(userId, now);
    const result = await recordSeamChoice(
      { userId, choice: data, ...ctx, now },
      sessionFlowDeps(),
    );
    return toSessionView(result);
  });

/** Resolve the render-time prompt for one queued word (the tier + the fields the UI shows). */
export const resolvePromptFn = createServerFn({ method: "GET" })
  .validator((senseId: unknown): string => {
    if (typeof senseId !== "string" || senseId.length === 0) {
      throw new Error("resolvePromptFn: senseId (non-empty string) required");
    }
    return senseId;
  })
  .handler(async ({ data }) =>
    resolveReviewPrompt(
      { userId: await currentUserId(), senseId: data },
      promptDeps(),
    ),
  );

export interface RuleCheckInput {
  senseId: string;
  response: string;
  priorBounces: number;
}

/**
 * The instant, judge-free rule-layer pre-screen for the judged tier (spec/04 RL-1..4, RL-6). It exists
 * as its own call so the "checking…" indicator never precedes a bounce (NET-2): a bounce is decided
 * here with no judge round-trip and no persistence (INV-2). On a pass the client then shows "checking…"
 * and calls `submitReviewFn`. At the RL-6 cap the model sentence is attached server-side so it is not in
 * the page until the reveal.
 */
export type RuleCheckResult =
  | { ok: true }
  | {
      ok: false;
      reason: RuleBounceReason;
      bounces: number;
      revealModelSentence: boolean;
      /** Present only when `revealModelSentence` — the RL-6 example to lean on. */
      modelSentence: string | null;
    };

export const ruleCheckFn = createServerFn({ method: "POST" })
  .validator((input: unknown): RuleCheckInput => {
    const o = input as Partial<RuleCheckInput> | null;
    if (!o || typeof o.senseId !== "string" || typeof o.response !== "string") {
      throw new Error("ruleCheckFn: { senseId, response } (strings) required");
    }
    return {
      senseId: o.senseId,
      response: o.response,
      priorBounces: typeof o.priorBounces === "number" ? o.priorBounces : 0,
    };
  })
  .handler(async ({ data }): Promise<RuleCheckResult> => {
    const deps = reviewDeps();
    const userId = await currentUserId();
    const check = await checkFreeProductionRuleLayer(
      {
        senseId: data.senseId,
        response: data.response,
        priorBounces: data.priorBounces,
      },
      deps,
    );
    if (check.ok) return { ok: true };
    // BAT-7: a bounce consumes time but never ticks — it stamps the absence anchor only. (On a
    // rule-layer pass the immediate submitReviewFn stamps, so no touch is needed here.)
    await advanceActiveBatch(
      { userId, senseId: data.senseId, ratingLogged: false },
      batchProgressDeps(),
    );
    const { reason, bounces, revealModelSentence } = check.bounce;
    // RL-6: only ship the example when it is actually being revealed (keeps it out of the page until then).
    const modelSentence = revealModelSentence
      ? (deps.catalog.get(data.senseId)?.model_sentence ?? null)
      : null;
    return { ok: false, reason, bounces, revealModelSentence, modelSentence };
  });

export interface SubmitReviewInput {
  senseId: string;
  response: string;
  /** RAT-5 / SM-9: the learner used a starter scaffold. Only the judged branch reads it. */
  scaffolded: boolean;
  /** FIT-8 / CUE-7: this presentation's accrued soft bounces. Read by the cloze AND cued branches. */
  priorSoftBounces: number;
  /** FIT-10: the cloze lanes those bounces took; only the cloze branch reads them. */
  priorSoftBounceLanes: ClozeSoftBounceLane[];
  /** BAT-15: client-measured card-shown → submit span; absent when the client measured nothing. */
  durationMs?: number;
}

/** The two soft-bounce lanes as the client may echo them back — anything else is rejected. */
const SOFT_BOUNCE_LANES: readonly ClozeSoftBounceLane[] = [
  "same_sense_near_miss",
  "different_sense_fit",
];

function isSoftBounceLanes(v: unknown): v is ClozeSoftBounceLane[] {
  return (
    Array.isArray(v) &&
    v.every((lane) => SOFT_BOUNCE_LANES.includes(lane as ClozeSoftBounceLane))
  );
}

/** One graded submit's response: the display view plus the batch bar's new truth (null = no active
 * batch — the rating stands regardless, BAT-1). */
export interface SubmitReviewResponse {
  view: ReviewOutcomeView;
  progress: BatchProgress | null;
}

/**
 * Grade one response through the loop and return a serializable display view (spec/11 LOOP-2/4/5).
 * The judged branch here runs the rule layer again (cheap/deterministic) before judging + persisting;
 * the client only reaches this after `ruleCheckFn` returned `ok`, so it will not bounce in practice.
 * After the pass, batch progress advances iff a rating was logged (BAT-7 — `reviewWasRated` reads the
 * same discriminants the use-cases returned, so the bar and FSRS ground truth cannot drift).
 */
export const submitReviewFn = createServerFn({ method: "POST" })
  .validator((input: unknown): SubmitReviewInput => {
    const o = input as Partial<SubmitReviewInput> | null;
    if (!o || typeof o.senseId !== "string" || typeof o.response !== "string") {
      throw new Error(
        "submitReviewFn: { senseId, response } (strings) required",
      );
    }
    return {
      senseId: o.senseId,
      response: o.response,
      scaffolded: o.scaffolded === true,
      priorSoftBounces:
        typeof o.priorSoftBounces === "number" ? o.priorSoftBounces : 0,
      priorSoftBounceLanes: isSoftBounceLanes(o.priorSoftBounceLanes)
        ? o.priorSoftBounceLanes
        : [],
      // BAT-15: only a sane finite span is accepted; anything else stays absent (never a 0).
      ...(typeof o.durationMs === "number" &&
      Number.isFinite(o.durationMs) &&
      o.durationMs > 0
        ? { durationMs: Math.round(o.durationMs) }
        : {}),
    };
  })
  .handler(async ({ data }): Promise<SubmitReviewResponse> => {
    const deps = reviewDeps();
    const userId = await currentUserId();
    const item = deps.catalog.get(data.senseId);
    if (item === undefined)
      throw new Error(`submitReviewFn: unknown sense_id ${data.senseId}`);
    const result = await runReviewPass(
      {
        userId,
        senseId: data.senseId,
        response: data.response,
        scaffolded: data.scaffolded,
        priorSoftBounces: data.priorSoftBounces,
        priorSoftBounceLanes: data.priorSoftBounceLanes,
        ...(data.durationMs === undefined ? {} : { durationMs: data.durationMs }),
      },
      deps,
    );
    const advanced = await advanceActiveBatch(
      { userId, senseId: data.senseId, ratingLogged: reviewWasRated(result) },
      batchProgressDeps(),
    );
    return {
      view: presentReviewOutcome(result, item.lemma),
      progress: advanced.active ? advanced.progress : null,
    };
  });
