import { createServerFn } from "@tanstack/react-start";
import { startSession } from "../../application/startSession.js";
import { runReviewPass, type RunReviewPassResult } from "../../application/runReviewPass.js";
import { resolveReviewPrompt } from "../../application/resolveReviewPrompt.js";
import { currentUserId } from "./currentUser.js";
import { promptDeps, reviewDeps, sessionDeps } from "./composition.js";

/** SEED-5: the dev user's default ~B2+NAWL frontier. */
const FRONTIER_BAND = "B2";

/**
 * Begin a session for the current (dev) user: seed paced introductions and return the ordered queue of
 * `senseId`s to walk (spec/11 LOOP-1). Secrets/DB stay server-side (NET-7/STACK-4).
 */
export const startSessionFn = createServerFn({ method: "POST" }).handler(async () => {
  const { queue } = await startSession(
    { userId: currentUserId(), frontierBand: FRONTIER_BAND },
    sessionDeps(),
  );
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
    resolveReviewPrompt({ userId: currentUserId(), senseId: data }, promptDeps()),
  );

export interface SubmitReviewInput {
  senseId: string;
  response: string;
}

/** A serializable summary of one graded pass for the UI (full FSRS state stays server-side). */
export interface ReviewOutcome {
  tier: RunReviewPassResult["tier"];
  passed: boolean;
  mastery: string;
  /** Set only for the free tier, which is not interactive in the deterministic slice. */
  note?: string;
}

/** Grade one response through the loop and return a display summary (spec/11 LOOP-2/4/5). */
export const submitReviewFn = createServerFn({ method: "POST" })
  .validator((input: unknown): SubmitReviewInput => {
    const o = input as Partial<SubmitReviewInput> | null;
    if (!o || typeof o.senseId !== "string" || typeof o.response !== "string") {
      throw new Error("submitReviewFn: { senseId, response } (strings) required");
    }
    return { senseId: o.senseId, response: o.response };
  })
  .handler(async ({ data }) =>
    summarize(
      await runReviewPass(
        { userId: currentUserId(), senseId: data.senseId, response: data.response },
        reviewDeps(),
      ),
    ),
  );

function summarize(res: RunReviewPassResult): ReviewOutcome {
  if (res.tier === "free") {
    // Free production is not wired into this deterministic slice; a fresh user's queue never reaches
    // it. Surface a neutral marker rather than fabricate a pass/fail.
    return { tier: res.tier, passed: false, mastery: "Productive", note: "free tier not yet interactive" };
  }
  // recognition | cloze | cued all resolve to the same DeterministicReviewResult shape.
  return { tier: res.tier, passed: res.outcome.passed, mastery: res.outcome.mastery };
}
