import type { NlpToken } from "~/domain/review/ruleLayer.js";

/**
 * The NLP port (spec/03 TIER-5, spec/04 RL-2/RL-3). One narrow capability: turn text into tokens the
 * domain's pure rules reason over. `NlpToken` is owned by the domain (ARCH-1), so this points inward.
 *
 * There is deliberately no separate `Lemmatizer` port any more. It existed when NLP ran in-process
 * (wink), where a second call was free; the engine is now a service, so a second port would mean a
 * second round trip for the same sentence. Candidate forms are a pure derivation over these tokens
 * (`formsOf` in `domain/review/grading.ts`), so ONE call serves both cued/cloze grading and the rule
 * layer — which is `SOLID-4` honored, not violated: this is one capability, not two.
 *
 * `Promise` because the implementation is out-of-process (`HttpNlp` → the Python language service).
 * That is the price of build and runtime sharing one engine, and one set of lemmas (see docs/BUILD.md).
 */
export interface SentenceAnalyzer {
  analyze(text: string): Promise<NlpToken[]>;
}
