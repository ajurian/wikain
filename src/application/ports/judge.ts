import type { JudgeVerdict } from "../../domain/verdict.js";

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
