import { createServerFn } from "@tanstack/react-start";
import { startSession } from "../../application/startSession.js";
import { runReviewPass } from "../../application/runReviewPass.js";
import { resolveReviewPrompt } from "../../application/resolveReviewPrompt.js";
import { checkFreeProductionRuleLayer } from "../../application/checkFreeProductionRuleLayer.js";
import {
  presentReviewOutcome,
  type ReviewOutcomeView,
} from "../../application/presentReviewOutcome.js";
import type { RuleBounceReason } from "../../domain/review/ruleLayer.js";
import { readPlacementProfile } from "../../application/readPlacementProfile.js";
import { currentUserId } from "./currentUser.js";
import { placementProfileDeps, promptDeps, reviewDeps, sessionDeps } from "./composition.js";

/**
 * Begin a session for the current user: seed paced introductions and return the ordered queue of
 * `senseId`s to walk (spec/11 LOOP-1). Secrets/DB stay server-side (NET-7/STACK-4).
 *
 * The frontier band comes from the learner's PERSISTED placement (SEED-2 mechanism (i)) — whatever
 * onboarding's coarse level, or a later LexTALE run, put there. It used to be a hardcoded "B2", which
 * silently discarded the level every learner had just chosen. An un-placed user still reads
 * `DEFAULT_FRONTIER_BAND` from the profile store's defaults, so the old behavior survives as the fallback.
 */
export const startSessionFn = createServerFn({ method: "POST" }).handler(async () => {
  const userId = await currentUserId();
  const { frontierBand } = await readPlacementProfile({ userId }, placementProfileDeps());
  const { queue } = await startSession({ userId, frontierBand }, sessionDeps());
  return { queue };
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
    resolveReviewPrompt({ userId: await currentUserId(), senseId: data }, promptDeps()),
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
    const check = checkFreeProductionRuleLayer(
      { senseId: data.senseId, response: data.response, priorBounces: data.priorBounces },
      deps,
    );
    if (check.ok) return { ok: true };
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
}

/**
 * Grade one response through the loop and return a serializable display view (spec/11 LOOP-2/4/5).
 * The judged branch here runs the rule layer again (cheap/deterministic) before judging + persisting;
 * the client only reaches this after `ruleCheckFn` returned `ok`, so it will not bounce in practice.
 */
export const submitReviewFn = createServerFn({ method: "POST" })
  .validator((input: unknown): SubmitReviewInput => {
    const o = input as Partial<SubmitReviewInput> | null;
    if (!o || typeof o.senseId !== "string" || typeof o.response !== "string") {
      throw new Error("submitReviewFn: { senseId, response } (strings) required");
    }
    return { senseId: o.senseId, response: o.response, scaffolded: o.scaffolded === true };
  })
  .handler(async ({ data }): Promise<ReviewOutcomeView> => {
    const deps = reviewDeps();
    const item = deps.catalog.get(data.senseId);
    if (item === undefined) throw new Error(`submitReviewFn: unknown sense_id ${data.senseId}`);
    const result = await runReviewPass(
      {
        userId: await currentUserId(),
        senseId: data.senseId,
        response: data.response,
        scaffolded: data.scaffolded,
      },
      deps,
    );
    return presentReviewOutcome(result, item.lemma);
  });
