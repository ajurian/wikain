import { motion, useReducedMotion } from "motion/react";

import { DURATION, EASE } from "@/lib/motion";
import { Info } from "lucide-react";
import type { ClozeSoftBounceLane } from "~/domain/review/clozeFitSet.js";

/**
 * Typed-cloze soft-bounce callout (spec/13 FIT-7). Like the rule-layer BounceCallout it is
 * deliberately NEUTRAL — a soft bounce is not an error and produced no rating: paper-sunken,
 * ink-soft, no red, a bare fade. The two lanes differ only in what they teach: same-sense asks for
 * precision; different-sense names the meaning gap (`gloss` is the item's bounce_gloss, shipped
 * only on this response — FIT-4). Both end on the first-letter cue ("o___", FIT-6).
 * Copy: brand/references/voice.md tone — retry stays in the flow, never "wrong".
 */
export function SoftBounceCallout({
  lane,
  typed,
  hintPrefix,
  gloss,
}: {
  lane: ClozeSoftBounceLane;
  /** The word the learner typed when this bounce happened (frozen — the input may change after). */
  typed: string;
  hintPrefix: string;
  gloss: string | null;
}) {
  const reduced = useReducedMotion();
  const hint = (
    <span className="font-serif text-ink">
      {hintPrefix}
      ___
    </span>
  );
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: DURATION.fast, ease: EASE }}
      role="status"
      className="flex items-start gap-2.5 rounded-lg bg-paper-sunken px-3.5 py-3"
    >
      <Info
        className="mt-0.5 size-4 shrink-0 text-ink-faint"
        strokeWidth={1.5}
      />
      <p className="text-sm leading-relaxed text-ink-soft">
        {lane === "same_sense_near_miss" ? (
          <>
            Close — we’re after a more precise word for this exact meaning:{" "}
            {hint}
          </>
        ) : (
          <>
            That’s a real sentence — but{" "}
            <span className="font-serif italic">{typed}</span> means something
            different here.{" "}
            {gloss ? (
              <>
                This word means {gloss}: {hint}
              </>
            ) : (
              <>Try the word that fits this meaning: {hint}</>
            )}
          </>
        )}
      </p>
    </motion.div>
  );
}
