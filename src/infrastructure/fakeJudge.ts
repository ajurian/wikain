/**
 * A fake JudgePort (spec/06 JDG-1) — the stand-in the judged-production slice is built around. The
 * real DeepSeek transport (JDG-10) and its failure handling are the `08` slice; this lets the whole
 * judged path run with NO network. It records requests so a test can assert the judge was not reached
 * on a rule-layer bounce (INV-2 / RL-1).
 */
import type { JudgePort, JudgeRequest } from "../application/ports/judge.js";
import type { JudgeVerdict } from "../domain/review/verdict.js";

/** A passing verdict (sense-correct, grammatical) with no advisory noise. */
export function passingVerdict(overrides: Partial<JudgeVerdict> = {}): JudgeVerdict {
  return {
    used_in_target_sense: true,
    detected_sense: "",
    intended_sense: "",
    grammatical: true,
    collocation_natural: true,
    register_fit: "ok",
    replacements: [],
    corrected_sentence: "",
    enrichment_suggestion: null,
    one_line_feedback: "",
    ...overrides,
  };
}

export class FakeJudge implements JudgePort {
  readonly calls: JudgeRequest[] = [];
  private readonly reply: JudgeVerdict | ((request: JudgeRequest) => JudgeVerdict);

  constructor(reply: JudgeVerdict | ((request: JudgeRequest) => JudgeVerdict) = passingVerdict()) {
    this.reply = reply;
  }

  async judge(request: JudgeRequest): Promise<JudgeVerdict> {
    this.calls.push(request);
    return typeof this.reply === "function" ? this.reply(request) : this.reply;
  }
}
