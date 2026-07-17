import { motion, useReducedMotion } from "motion/react";
import { EditedSentence } from "./edited-sentence";
import { MasteryChip } from "@/components/mastery-chip";
import { DURATION } from "@/lib/motion";
import type { MasteryState } from "~/domain/mastery/card.js";
import type { Replacement } from "@/types/verdict";

/**
 * Judged verdict (LOOP-4). Pass and fail use the SAME reveal animation — color
 * carries the meaning (design-system/references/motion.md). Fail includes the
 * demotion line (SM-6/7) and never says "wrong answer" (brand voice).
 *
 * The wash tints the verdict bar ONLY, with a 3px accent rule on its left edge; the panel itself
 * stays paper. The mono PASS/FAIL label is deliberately text, not an icon — it keeps the verdict
 * legible without relying on color alone.
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
  replacements: Replacement[];
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
      transition={{ duration: DURATION.base }}
      className="space-y-4"
    >
      <div
        className={`flex items-baseline gap-2.5 rounded-sm border-l-[3px] px-3.5 py-3 ${
          passed ? "border-moss bg-moss-wash" : "border-terracotta bg-terra-wash"
        }`}
      >
        <p
          className={`shrink-0 font-mono text-[10.5px] font-medium tracking-wide uppercase ${
            passed ? "text-moss" : "text-terracotta"
          }`}
        >
          {passed ? "Pass" : "Fail"}
        </p>
        <p className={`text-sm font-medium ${passed ? "text-moss" : "text-terracotta"}`}>
          {passed
            ? replacements.length > 0
              ? "Nicely used — one polish:"
              : "Nicely used."
            : "Not the sense we’re after here."}
        </p>
      </div>

      {!passed && detectedSense && intendedSense ? (
        <div className="space-y-1.5 text-sm leading-relaxed text-ink-soft">
          <p>
            <span className="mr-1.5 font-mono text-[10.5px] tracking-wide text-ink-faint uppercase">
              Detected
            </span>
            {detectedSense}
          </p>
          <p>
            <span className="mr-1.5 font-mono text-[10.5px] tracking-wide text-ink-faint uppercase">
              Intended
            </span>
            {intendedSense}
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
