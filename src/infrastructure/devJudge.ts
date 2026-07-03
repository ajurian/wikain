/**
 * A content-varying dev verdict for the judged branch (spec/06 JDG-*), used server-side ONLY when no
 * `DEEPSEEK_API_KEY` is configured (see presentation/server/composition.ts). It lets the whole judged
 * flow — clean pass, polish-edit pass, sense fail, and a transport failure — be driven end-to-end with
 * NO network and NO key, so `npm run dev` and the test suite stay offline. When the key is present the
 * real `liveJudge()` (DeepSeek, NET-7) is selected instead; this file is never reached in that path.
 *
 * The triggers mirror the retired mock judge (src/presentation/mock/judge.ts) so the same demo inputs
 * exercise the same UI states:
 *   - "(error)"         → throws JudgeUnavailableError("transient")  → the `unavailable` arm (NET-3/4)
 *   - "(fail)"          → a sense fail (JDG-2 gate false)            → demotion + inline edit (LOOP-4)
 *   - " very "/" really" → a clean pass WITH a collocation polish edit (JDG-5, EDIT-7)
 *   - otherwise         → a clean pass + an enrichment suggestion   (CNT-7)
 * NET-5 (offline-at-submit) is a client pre-submit block, not a verdict, so it is not modelled here.
 */
import type { JudgeRequest } from "../application/ports/judge.js";
import { JudgeUnavailableError } from "../application/ports/judge.js";
import type { JudgeVerdict } from "../domain/verdict.js";
import { passingVerdict } from "./fakeJudge.js";

/** The single verdict-level feedback line (JDG-4) — the UI reveals it on tapping any edited span. */
export function devVerdict(request: JudgeRequest): JudgeVerdict {
  const { sentence, lemma } = request;

  // A well-formed input that reached the judge but yielded no verdict (transport failure, NET-3/4).
  if (sentence.includes("(error)")) {
    throw new JudgeUnavailableError("transient");
  }

  // Sense fail: the gate `used_in_target_sense` is false (JDG-2). Strike the learner's use of the
  // target word so an inline edit resolves (EDIT-3 needs a `find` that occurs in the raw sentence).
  if (sentence.includes("(fail)")) {
    const hit = new RegExp(`\\b${escapeRegExp(lemma)}\\w*\\b`, "i").exec(sentence);
    return {
      ...passingVerdict(),
      used_in_target_sense: false,
      detected_sense: `a different sense of “${lemma}” than the one being practiced`,
      intended_sense: request.intendedSense ?? "the sense being practiced",
      replacements: hit ? [{ find: hit[0], replace: lemma, reason: "sense" }] : [],
      corrected_sentence: request.modelSentence ?? sentence,
      one_line_feedback: `Here “${lemma}” is being used in another sense — aim for the target meaning.`,
    };
  }

  // Clean pass with a collocation polish (advisory only — never blocks the gate, JDG-5).
  const polish = [" very ", " really "].find((w) => sentence.toLowerCase().includes(w));
  if (polish) {
    const idx = sentence.toLowerCase().indexOf(polish);
    const raw = sentence.slice(idx, idx + polish.length).trim();
    return {
      ...passingVerdict(),
      collocation_natural: false,
      replacements: [{ find: raw, replace: "genuinely", reason: "collocation" }],
      corrected_sentence: sentence.replace(new RegExp(`\\b${escapeRegExp(raw)}\\b`), "genuinely"),
      one_line_feedback: "A more precise intensifier reads a little more naturally.",
    };
  }

  // Clean pass — affirm and offer an upgrade framed as enrichment, never a fix (CNT-7).
  return {
    ...passingVerdict(),
    enrichment_suggestion: request.modelSentence
      ? `You could also say: “${request.modelSentence}”`
      : null,
  };
}

/** Escape a lemma before embedding it in a RegExp (defensive — some lemmas carry punctuation). */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
