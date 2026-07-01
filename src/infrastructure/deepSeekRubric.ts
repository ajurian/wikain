/**
 * The cloud-judge rubric: the system prompt + few-shot calibration examples (spec/06 JDG-10/JDG-11).
 * Isolated here so it is byte-identical on every call — that is what lets DeepSeek prompt caching apply
 * (JDG-11: the dominant per-call cost lever). `RUBRIC_VERSION` is the global-swap / memo-invalidation
 * lever (JDG-9, spec/05 MEMO version): bump it whenever the rubric or model changes.
 *
 * The rubric encodes the normative judging policy — it does NOT re-decide it in code: the gate is
 * `used_in_target_sense AND grammatical` (JDG-2), grammar fails only when meaning-obscuring (JDG-1),
 * the bias is lenient (JDG-3), Tagalog-L1 surface errors are corrected-and-passed (JDG-7), and v1 is a
 * single clean-English mode (JDG-12). Collocation/register are advisory only (JDG-5).
 */
import type { JudgeRequest } from "../application/ports/judge.js";

/** JDG-9 / spec/05: bump on any rubric or model change so memoized verdicts invalidate. */
export const RUBRIC_VERSION = "2026-07-01";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const SYSTEM_PROMPT = [
  "You are a strict-on-meaning, lenient-on-style judge of a single English sentence written by a",
  "Tagalog-speaking English learner who was asked to use one target word in a specific sense.",
  "",
  "Return ONLY a JSON object with exactly these fields:",
  '{"used_in_target_sense":bool,"detected_sense":str,"intended_sense":str,"grammatical":bool,',
  '"collocation_natural":bool,"register_fit":"ok"|"informal"|"formal"|"off","replacements":',
  '[{"find":str,"replace":str,"reason":"grammar"|"collocation"|"register"|"sense"}],',
  '"corrected_sentence":str,"enrichment_suggestion":str|null,"one_line_feedback":str}',
  "",
  "Two fields are HARD GATES and your only job that blocks advancement:",
  "1. used_in_target_sense — true iff the word is used in the intended sense AND part of speech.",
  "2. grammatical — true unless an error genuinely OBSCURES MEANING. Surface / L1-transfer errors",
  "   (missing articles, tense/aspect transfer, fixed-phrase swaps) are corrected-and-passed via",
  "   `replacements`/`corrected_sentence`, NOT failed.",
  "",
  "Be lenient: wrongly rejecting a correct sentence is the worst outcome. collocation_natural and",
  "register_fit are ADVISORY — they generate upgrade suggestions and MUST NEVER change the gates.",
  "Each `find` MUST be an exact substring copied verbatim from the learner's sentence.",
].join("\n");

/**
 * JDG-10: 2–3 few-shot calibration examples pinning the lenient-grammar / strict-sense boundary. Kept
 * minimal (KISS) — enough to anchor the gate behavior without bloating the cached prefix.
 */
export function calibrationMessages(): ChatMessage[] {
  return [
    {
      role: "user",
      content:
        'Target word "negotiate" (verb), intended sense "to reach agreement by discussion".\n' +
        'Sentence: "She negotiate a better price with the seller yesterday."',
    },
    {
      role: "assistant",
      content: JSON.stringify({
        used_in_target_sense: true,
        detected_sense: "to reach agreement by discussion",
        intended_sense: "to reach agreement by discussion",
        grammatical: true,
        collocation_natural: true,
        register_fit: "ok",
        replacements: [{ find: "negotiate", replace: "negotiated", reason: "grammar" }],
        corrected_sentence: "She negotiated a better price with the seller yesterday.",
        enrichment_suggestion: null,
        one_line_feedback: "Correct sense; just fix the past tense.",
      }),
    },
    {
      role: "user",
      content:
        'Target word "abandon" (verb), intended sense "to give up completely".\n' +
        'Sentence: "The soldiers abandon shows great courage in battle."',
    },
    {
      role: "assistant",
      content: JSON.stringify({
        used_in_target_sense: false,
        detected_sense: "a feeling of unrestrained freedom (noun)",
        intended_sense: "to give up completely",
        grammatical: false,
        collocation_natural: false,
        register_fit: "ok",
        replacements: [],
        corrected_sentence: "",
        enrichment_suggestion: null,
        one_line_feedback: "This uses the wrong sense/part of speech of the word.",
      }),
    },
  ];
}

/** The per-request user turn: the sentence plus the in-context references the rubric needs (JDG-4). */
export function userTurn(request: JudgeRequest): string {
  const sense = request.intendedSense ?? "(sense not specified)";
  const anchor = request.modelSentence ? `\nModel sentence: "${request.modelSentence}"` : "";
  return (
    `Target word "${request.lemma}", intended sense "${sense}".${anchor}\n` +
    `Sentence: "${request.sentence}"`
  );
}
