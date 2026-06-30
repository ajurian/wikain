import { checkRuleLayer, type RuleBounceReason } from "../domain/ruleLayer.js";
import { demoteOneRung, promoteOnJudgedPass } from "../domain/mastery.js";
import { passesGate, type JudgeVerdict } from "../domain/verdict.js";
import { deriveRating, type Rating } from "../domain/rating.js";
import { distinctPassDays, mostRecentPassScaffolded } from "../domain/judgedPassLedger.js";
import { qualifiesForFluent } from "../domain/fluentGate.js";
import { MAX_RULE_BOUNCE_RETRIES } from "../domain/constants.js";
import type { Card, MasteryState } from "../domain/card.js";
import type { ReviewLog } from "../domain/review.js";
import type { Catalog } from "./ports/catalog.js";
import type { CardRepository } from "./ports/cardRepository.js";
import type { Scheduler } from "./ports/scheduler.js";
import type { Lemmatizer } from "./ports/lemmatizer.js";
import type { SentenceAnalyzer } from "./ports/sentenceAnalyzer.js";
import type { JudgePort } from "./ports/judge.js";

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
}

/** A rule-layer bounce: no rating, no scheduler call, no ReviewLog, card stays due (INV-2). */
export interface BounceResult {
  kind: "bounce";
  reason: RuleBounceReason;
  /** Bounces accrued on this presentation including this one. */
  bounces: number;
  /** RL-6: at the cap, reveal the model sentence + offer skip (still no rating). */
  revealModelSentence: boolean;
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

export type SubmitFreeProductionResult = BounceResult | JudgedResult;

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
 *
 * The verdict memo (spec/05 MEMO-1, a `MAY`) is intentionally not consulted here yet.
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

  const modelSentenceWords =
    item.model_sentence === null
      ? null
      : deps.analyzer
          .analyze(item.model_sentence)
          .filter((t) => t.isWord)
          .map((t) => t.normal);

  const rule = checkRuleLayer({
    targetLemma: item.lemma,
    responseForms: deps.lemmatizer.formsOf(input.response),
    responseTokens: deps.analyzer.analyze(input.response),
    modelSentenceWords,
    tagalogLexicon: deps.tagalogLexicon,
  });

  // INV-2 / RAT-2: a bounce never derives a rating, never calls the scheduler, never logs. The card
  // is left untouched (stays due). RL-6: at the cap, surface the model sentence.
  if (!rule.ok) {
    const bounces = (input.priorBounces ?? 0) + 1;
    return {
      kind: "bounce",
      reason: rule.reason,
      bounces,
      revealModelSentence: bounces >= MAX_RULE_BOUNCE_RETRIES,
    };
  }

  // RL-1: the judge runs only on a rule-layer pass. (Memo lookup, spec/05, is deferred.)
  const verdict = await deps.judge.judge({
    sentence: input.response,
    lemma: item.lemma,
    intendedSense: item.intended_sense,
    modelSentence: item.model_sentence,
  });

  // INV-1 / RAT-1 / RAT-4: exactly one rating on this single verdict.
  const passed = passesGate(verdict);
  const rating = deriveRating(passed);
  const { card: nextFsrs, log: fsrsLog } = deps.scheduler.next(card.fsrs, rating, now);

  // RAT-8 / DM-6: the single ReviewLog for this rated review; RAT-5: scaffold flag instrumented.
  const reviewLog: ReviewLog = {
    userId: input.userId,
    senseId: input.senseId,
    tier: "free",
    rating,
    reviewedAt: now,
    scaffolded: input.scaffolded ?? false,
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
