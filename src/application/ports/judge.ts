import type { JudgeVerdict } from "../../domain/review/verdict.js";

/**
 * The cloud-judge request (spec/06-cloud-judge.md JDG-4). Carries the sentence plus the in-context
 * references the rubric needs (`intendedSense`, `modelSentence` — DM-2 generated fields).
 */
export interface JudgeRequest {
  sentence: string;
  lemma: string;
  intendedSense: string | null;
  modelSentence: string | null;
}

/**
 * Cloud-judge port (JDG-1, ARCH-3). The application depends on this interface, never on the DeepSeek
 * transport (JDG-10) — which lives behind it in infrastructure (the `08` failure-path slice). In this
 * slice it is satisfied by a fake (FakeJudge); no network is involved. Narrow by intent (SOLID-4).
 */
export interface JudgePort {
  judge(request: JudgeRequest): Promise<JudgeVerdict>;
}

/**
 * Why the judge could not return a verdict (spec/08-failure-path.md). All map to the same persistence
 * outcome — no rating, no scheduler call, no ReviewLog, the card stays due (INV-2 / RAT-2) — but carry
 * distinct reasons so a future UI can surface the right neutral message (NET-3/4/5).
 */
export type JudgeUnavailableReason =
  /** NET-3: timeout / 5xx / transient network error that persisted past the one retry. */
  | "transient"
  /** NET-4: 429 / rate limit. */
  | "rate_limited"
  /** NET-5: no connectivity at submit time. */
  | "offline"
  /** JDG-6/JDG-3: a 2xx response whose body is not a schema-valid verdict — never fabricate one. */
  | "invalid_response";

/**
 * Raised by a JudgePort adapter when a verdict cannot be obtained (spec/08 NET-3/4/5/6). Declared with
 * the port (the port owns both its success type and the failure it may raise): infrastructure throws
 * it, the application catches it (dependency points inward — ARCH-1). It is NOT a rule-layer bounce
 * (RL-*) — a bounce is malformed learner input; this is a transport failure on well-formed input.
 */
export class JudgeUnavailableError extends Error {
  constructor(
    readonly reason: JudgeUnavailableReason,
    message?: string,
    options?: { cause?: unknown },
  ) {
    super(message ?? `judge unavailable: ${reason}`, options);
    this.name = "JudgeUnavailableError";
  }
}
