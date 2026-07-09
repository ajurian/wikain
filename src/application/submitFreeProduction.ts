import { demoteOneRung, promoteOnJudgedPass } from "../domain/mastery.js";
import { passesGate, type JudgeVerdict } from "../domain/verdict.js";
import { deriveRating, type Rating } from "../domain/rating.js";
import { distinctPassDays, mostRecentPassScaffolded } from "../domain/judgedPassLedger.js";
import { qualifiesForFluent } from "../domain/fluentGate.js";
import type { Card, MasteryState } from "../domain/card.js";
import type { ReviewLog } from "../domain/review.js";
import type { Catalog } from "./ports/catalog.js";
import type { CardRepository } from "./ports/cardRepository.js";
import type { Scheduler } from "./ports/scheduler.js";
import type { Lemmatizer } from "./ports/lemmatizer.js";
import type { SentenceAnalyzer } from "./ports/sentenceAnalyzer.js";
import { JudgeUnavailableError, type JudgePort, type JudgeUnavailableReason } from "./ports/judge.js";
import type { MemoVersions, VerdictMemoPort } from "./ports/verdictMemo.js";
import { memoKey, normalizeSentence } from "../domain/verdictMemo.js";
import {
  checkFreeProductionRuleLayer,
  type BounceResult,
} from "./checkFreeProductionRuleLayer.js";

// Re-exported so existing consumers (runReviewPass, presentation) keep importing it from here.
export type { BounceResult } from "./checkFreeProductionRuleLayer.js";

export interface SubmitFreeProductionInput {
  userId: string;
  senseId: string;
  response: string;
  /** RAT-5 / SM-9: recorded for the mastery ladder, never used to rate in v1. Defaults to false. */
  scaffolded?: boolean;
  /**
   * RL-6: how many times THIS presentation has already bounced. The use-case is stateless — the
   * presentation owns per-presentation retry state and passes it in. Defaults to 0.
   */
  priorBounces?: number;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
}

export interface SubmitFreeProductionDeps {
  catalog: Catalog;
  cards: CardRepository;
  scheduler: Scheduler;
  lemmatizer: Lemmatizer;
  analyzer: SentenceAnalyzer;
  judge: JudgePort;
  /** Shipped Tagalog lexicon, lowercased (RL-4). */
  tagalogLexicon: ReadonlySet<string>;
  /** spec/05: the per-user verdict cache consulted before the judge (MEMO-1) and written on judge. */
  memo: VerdictMemoPort;
  /** spec/05 MEMO-6: the model/rubric stamp a memo hit must match; a bump invalidates stale rows. */
  judgeVersions: MemoVersions;
}

/** A judged outcome: exactly one rating, one ReviewLog, and at most one demotion (INV-1). */
export interface JudgedResult {
  kind: "judged";
  passed: boolean;
  rating: Rating;
  verdict: JudgeVerdict;
  mastery: MasteryState;
  due: Date;
}

/**
 * A cloud-judge transport failure (spec/08 NET-3/4/5): the input was well-formed (it passed the rule
 * layer, so the judge was reached), but no verdict came back. Like a bounce it derives no rating, makes
 * no scheduler call, writes no ReviewLog, and leaves the card due (INV-2 / RAT-2) — but it is a
 * transport failure, not malformed input, so it is a distinct outcome carrying the failure reason.
 */
export interface UnavailableResult {
  kind: "unavailable";
  reason: JudgeUnavailableReason;
}

export type SubmitFreeProductionResult = BounceResult | JudgedResult | UnavailableResult;

/**
 * The judged free-production review pass — the cloud-judge branch of the end-to-end loop
 * (spec/11-end-to-end-loop.md LOOP). Free production is shown at `Productive` (SM-1). It realizes:
 *  - RL-1/RL-2/RL-3/RL-4: the rule layer gates the judge; a bounce is NOT a review (INV-2 / RAT-2) —
 *    no rating, no scheduler.next, no ReviewLog, the card stays due.
 *  - RL-6: bounces are capped at MAX_RULE_BOUNCE_RETRIES; the cap reveals the model sentence.
 *  - JDG-1/JDG-2: the judge runs only on a rule-layer pass; the gate is sense AND grammar.
 *  - INV-1 / RAT-1 / RAT-4: one judged verdict → exactly one rating on the first genuine gate fail
 *    (no retry-until-pass — the use-case judges once and schedules once).
 *  - SM-6 / SM-7: a gate fail demotes one rung (floor Recognized).
 *  - SM-5: a gate pass at Productive promotes to Fluent iff the four-condition gate qualifies
 *    (≥FLUENT_JUDGED_PASSES spaced judged passes, FSRS stability, unscaffolded most-recent — derived
 *    from the judged-pass ledger over the persisted ReviewLogs); otherwise mastery is unchanged.
 *  - RAT-8 / DM-6: exactly one ReviewLog per rated review; RAT-5: the scaffold flag is instrumented.
 *  - MEMO-1: the verdict memo is consulted after the rule-layer pass and before the judge; a hit
 *    returns the stored verdict and skips the billable call. It changes NO gate outcome (a hit is the
 *    byte-identical verdict a fresh judge would return), and a miss records the verdict on judge.
 */
export async function submitFreeProduction(
  input: SubmitFreeProductionInput,
  deps: SubmitFreeProductionDeps,
): Promise<SubmitFreeProductionResult> {
  const now = input.now ?? new Date();

  const item = deps.catalog.get(input.senseId);
  if (item === undefined) throw new Error(`unknown sense_id: ${input.senseId}`);

  const card = await deps.cards.load(input.userId, input.senseId);
  if (card === undefined) {
    throw new Error(`no card for user ${input.userId} / sense ${input.senseId}`);
  }

  // RL-1..4 / RL-6: the shared rule-layer pre-screen (one source of truth with the presentation's
  // instant rule-check, NET-2). INV-2 / RAT-2: a bounce never derives a rating, never calls the
  // scheduler, never logs — the card is left untouched (stays due).
  const rule = checkFreeProductionRuleLayer(
    { senseId: input.senseId, response: input.response, priorBounces: input.priorBounces },
    deps,
  );
  if (!rule.ok) return rule.bounce;

  // MEMO-1/2: consult the per-user memo after the rule-layer pass, before the judge. The key is the
  // pure (normalized sentence + lemma + sense) triple (MEMO-2); a version-matched hit (MEMO-6) returns
  // the stored verdict and skips the billable call. A miss judges then records below. `intendedSense`
  // is item-derived, so the same senseId always keys the same intended sense (MEMO-2 stays sound).
  const key = memoKey({
    normalizedSentence: normalizeSentence(input.response),
    lemma: item.lemma,
    senseId: input.senseId,
  });
  const cached = await deps.memo.lookup(input.userId, key, deps.judgeVersions);

  // RL-1: the judge runs only on a rule-layer pass — and only on a memo miss (MEMO-1).
  // INV-2 / NET-3/4/5: a transport failure (timeout/5xx/429/offline, after the adapter's one retry —
  // NET-6) yields no verdict. It must NOT be rated `Again` (that would inject a phantom lapse). The
  // card is left untouched (stays due) and the failure reason is surfaced for the UI's neutral message.
  let verdict: JudgeVerdict;
  // RAT-5: latency of the judge round-trip, in ms. Undefined on a memo hit — no call was made, so
  // there is no round-trip to time (fabricating 0 would understate real latencies in the aggregate).
  let latencyMs: number | undefined;
  if (cached !== undefined) {
    verdict = cached;
  } else {
    const startedAt = Date.now();
    try {
      verdict = await deps.judge.judge({
        sentence: input.response,
        lemma: item.lemma,
        intendedSense: item.intended_sense,
        modelSentence: item.model_sentence,
      });
    } catch (error) {
      if (error instanceof JudgeUnavailableError) {
        return { kind: "unavailable", reason: error.reason };
      }
      throw error;
    }
    latencyMs = Date.now() - startedAt;
    // MEMO-6: write-on-judge only (never on an unavailable transport failure — that path returned above).
    await deps.memo.record(input.userId, key, verdict, deps.judgeVersions);
  }

  // INV-1 / RAT-1 / RAT-4: exactly one rating on this single verdict.
  const passed = passesGate(verdict);
  const rating = deriveRating(passed);
  const { card: nextFsrs, log: fsrsLog } = deps.scheduler.next(card.fsrs, rating, now);

  // RAT-8 / DM-6: the single ReviewLog for this rated review. RAT-5 richer signals instrumented from
  // day one (v1 does not rate on them): `scaffolded` (SM-9), `retryCount` = rule-layer bounces before
  // this graded attempt (RL-6), `latencyMs` = judge round-trip. Typo-fix does not apply to free
  // production (it is a typed-answer tolerance, spec/02 Deferred) — omitted, not fabricated.
  const reviewLog: ReviewLog = {
    userId: input.userId,
    senseId: input.senseId,
    tier: "free",
    rating,
    reviewedAt: now,
    scaffolded: input.scaffolded ?? false,
    retryCount: input.priorBounces ?? 0,
    ...(latencyMs === undefined ? {} : { latencyMs }),
    fsrs: fsrsLog,
  };

  // SM-6 / SM-7: a gate fail demotes one rung. SM-5: a pass promotes Productive → Fluent only when
  // the four-condition gate qualifies; a Fluent maintenance pass stays Fluent (JDG-8).
  let mastery: MasteryState;
  if (!passed) {
    mastery = demoteOneRung(card.mastery);
  } else if (card.mastery === "Productive") {
    // The ledger is derived from prior logs + this pass (judgedPassLedger) so cued passes never
    // count (INV-4); stability is read post-review. Day boundary defaults to UTC (per-user tz is
    // seeding-deferred). Only Productive is queried — Fluent maintenance skips the read.
    const ledger: ReviewLog[] = [
      ...(await deps.cards.logsForWord(input.userId, input.senseId)),
      reviewLog,
    ];
    const qualifies = qualifiesForFluent({
      passDays: distinctPassDays(ledger),
      stability: nextFsrs.stability,
      mostRecentScaffolded: mostRecentPassScaffolded(ledger),
    });
    mastery = promoteOnJudgedPass(card.mastery, qualifies);
  } else {
    mastery = card.mastery;
  }

  const updated: Card = { ...card, mastery, fsrs: nextFsrs };
  await deps.cards.save(updated);
  await deps.cards.appendReviewLog(reviewLog);

  return { kind: "judged", passed, rating, verdict, mastery, due: nextFsrs.due };
}
