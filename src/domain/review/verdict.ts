/**
 * The cloud-judge verdict (spec/06-cloud-judge.md JDG-4 JSON contract) and the pure promotion gate
 * (JDG-2). Declared in the domain so the gate decision is library-free (ARCH-1); the judge transport
 * (DeepSeek, JDG-10) lives behind the JudgePort in infrastructure and returns this shape.
 */

/** A single advisory/correcting edit (spec/07-edit-resolution.md consumes these). */
export interface Replacement {
  find: string;
  replace: string;
  reason: "grammar" | "collocation" | "register" | "sense";
}

/** The structured verdict the judge returns (JDG-4). Only two fields are gates (JDG-1/JDG-2). */
export interface JudgeVerdict {
  /** GATE — the model's single irreplaceable job (JDG-1). */
  used_in_target_sense: boolean;
  detected_sense: string;
  intended_sense: string;
  /** GATE — fails only when an error obscures meaning; surface/L1 errors are corrected-and-passed. */
  grammatical: boolean;
  collocation_natural: boolean; // advisory
  register_fit: "ok" | "informal" | "formal" | "off"; // advisory
  replacements: Replacement[];
  corrected_sentence: string;
  enrichment_suggestion: string | null;
  one_line_feedback: string;
}

/**
 * JDG-2: the promotion gate is `used_in_target_sense AND grammatical` — nothing else blocks
 * advancement. JDG-5: advisory axes (collocation/register) and `replacements` are presentation, never
 * adjudication; they MUST NOT change this decision.
 */
export function passesGate(verdict: JudgeVerdict): boolean {
  return verdict.used_in_target_sense && verdict.grammatical;
}
