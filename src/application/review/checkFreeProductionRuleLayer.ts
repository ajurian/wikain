import { checkRuleLayer, type RuleBounceReason } from "../../domain/review/ruleLayer.js";
import { MAX_RULE_BOUNCE_RETRIES } from "../../domain/constants.js";
import type { Catalog } from "../ports/catalog.js";
import type { Lemmatizer } from "../ports/lemmatizer.js";
import type { SentenceAnalyzer } from "../ports/sentenceAnalyzer.js";

export interface CheckFreeProductionRuleLayerInput {
  senseId: string;
  response: string;
  /**
   * RL-6: how many times THIS presentation has already bounced. The use-case is stateless — the
   * presentation owns per-presentation retry state and passes it in. Defaults to 0.
   */
  priorBounces?: number;
}

/** Only the ports the rule layer reasons over — a strict subset of `SubmitFreeProductionDeps` (SOLID-4). */
export interface CheckFreeProductionRuleLayerDeps {
  catalog: Catalog;
  lemmatizer: Lemmatizer;
  analyzer: SentenceAnalyzer;
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

/**
 * The rule layer verdict for one free-production submission: it either passes to the judge (`ok`) or
 * bounces. Discriminated on `ok` so callers narrow cleanly (the bounce payload is nested, since
 * `BounceResult` carries no `ok` field of its own).
 */
export type RuleLayerCheck = { ok: true } | { ok: false; bounce: BounceResult };

/**
 * The free, in-process pre-screen that gates the cloud judge (spec/04 RL-1..4, RL-6). Extracted from
 * `submitFreeProduction` so the identical bounce decision has ONE source of truth (PRAG-3): the full
 * judged pass reuses it, and the presentation's instant rule-check server function (NET-2 — "checking…"
 * must never precede a bounce) calls it directly, without reaching the judge or persistence (INV-2).
 *
 * A bounce is NOT a review (INV-2 / RAT-2) — no rating, no scheduler call, no ReviewLog. That is
 * enforced by the caller, which simply never schedules on a bounce; this use-case only decides.
 */
export function checkFreeProductionRuleLayer(
  input: CheckFreeProductionRuleLayerInput,
  deps: CheckFreeProductionRuleLayerDeps,
): RuleLayerCheck {
  const item = deps.catalog.get(input.senseId);
  if (item === undefined) throw new Error(`unknown sense_id: ${input.senseId}`);

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

  if (rule.ok) return { ok: true };

  // RL-6: at the cap, surface the model sentence (the caller reveals it; still no rating).
  const bounces = (input.priorBounces ?? 0) + 1;
  return {
    ok: false,
    bounce: {
      kind: "bounce",
      reason: rule.reason,
      bounces,
      revealModelSentence: bounces >= MAX_RULE_BOUNCE_RETRIES,
    },
  };
}
