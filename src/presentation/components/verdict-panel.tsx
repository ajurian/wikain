import { motion, useReducedMotion } from "motion/react";
import { CircleCheck, CircleX } from "lucide-react";
import { EditedSentence } from "./edited-sentence";
import { MasteryChip } from "./mastery-chip";
import type { MasteryState } from "../mock/learner";
import type { MockReplacement } from "../mock/judge";

/**
 * Judged verdict (LOOP-4). Pass and fail use the SAME reveal animation — color
 * carries the meaning (design-system/references/motion.md). Fail includes the
 * demotion line (SM-6/7) and never says "wrong answer" (brand voice).
 */
export function VerdictPanel({
  passed,
  rawSentence,
  replacements,
  correctedSentence,
  detectedSense,
  intendedSense,
  enrichment,
  lemma,
  demotedTo,
}: {
  passed: boolean;
  rawSentence: string;
  replacements: MockReplacement[];
  correctedSentence?: string;
  detectedSense?: string;
  intendedSense?: string;
  enrichment?: string;
  lemma: string;
  demotedTo?: MasteryState;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="space-y-4"
    >
      <div
        className={`flex items-center gap-2.5 rounded-lg px-3.5 py-3 ${
          passed ? "bg-moss-wash" : "bg-terracotta-wash"
        }`}
      >
        {passed ? (
          <CircleCheck className="size-5 shrink-0 text-moss" strokeWidth={1.75} />
        ) : (
          <CircleX className="size-5 shrink-0 text-terracotta" strokeWidth={1.75} />
        )}
        <p className={`text-sm font-medium ${passed ? "text-moss" : "text-terracotta"}`}>
          {passed
            ? replacements.length > 0
              ? "Nicely used — one polish:"
              : "Nicely used."
            : "Not the sense we’re after here."}
        </p>
      </div>

      {!passed && detectedSense && intendedSense ? (
        <div className="space-y-1 text-sm leading-relaxed text-ink-soft">
          <p>
            <span className="font-medium text-ink">Your sentence used:</span> {detectedSense}
          </p>
          <p>
            <span className="font-medium text-ink">We’re practicing:</span> {intendedSense}
          </p>
        </div>
      ) : null}

      {replacements.length > 0 || (!passed && correctedSentence) ? (
        <EditedSentence
          rawSentence={rawSentence}
          replacements={replacements}
          correctedSentence={correctedSentence}
        />
      ) : null}

      {passed && enrichment ? (
        <p className="text-sm leading-relaxed text-ink-soft">
          <span className="font-medium text-ink">Upgrade:</span> {enrichment}
        </p>
      ) : null}

      {!passed && demotedTo ? (
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <span className="font-serif italic">{lemma}</span> moved back a step — it’ll come around
          again. <MasteryChip state={demotedTo} />
        </p>
      ) : null}
    </motion.div>
  );
}
