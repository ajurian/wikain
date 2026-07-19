import { motion, useReducedMotion } from "motion/react";

import { DURATION, EASE } from "@/lib/motion";
import { Info } from "lucide-react";
import type { ClozeSoftBounceLane } from "~/domain/review/clozeFitSet.js";

/**
 * Soft-bounce callout for the two tiers that have one — cloze (spec/13 FIT-7) and cued (spec/15
 * CUE-6). Like the rule-layer BounceCallout it is deliberately NEUTRAL: a soft bounce is not an error
 * and produced no rating — paper-sunken, ink-soft, no red, a bare fade. All variants end on the
 * first-letter cue ("j___", FIT-6 / CUE-7), never revealing the target before the cap.
 *
 * Cloze has two lanes: same-sense asks for precision; different-sense names the meaning gap (`gloss`
 * is the item's bounce_gloss, shipped only on this response — FIT-4). Cued has a single lane: the
 * learner produced a valid same-sense synonym (CUE-4), so the copy credits the near-success and points
 * at the one specific word being built.
 * Copy: brand/references/voice.md tone — retry stays in the flow, never "wrong".
 *
 * Props are a discriminated union on `kind` — callers narrow and pass explicit props (JSX cannot
 * distribute a spread over a union).
 */
type SoftBounceCalloutProps =
  | {
      kind: "cloze";
      lane: ClozeSoftBounceLane;
      /** The word the learner typed when this bounce happened (frozen — the input may change after). */
      typed: string;
      hintPrefix: string;
      gloss: string | null;
    }
  | {
      kind: "cued";
      typed: string;
      hintPrefix: string;
    };

export function SoftBounceCallout(props: SoftBounceCalloutProps) {
  const reduced = useReducedMotion();
  const hint = (
    <span className="font-serif text-ink">
      {props.hintPrefix}
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
        {props.kind === "cued" ? (
          <>
            <span className="font-serif italic">{props.typed}</span> is a
            synonym — but we’re building one specific word here: {hint}
          </>
        ) : props.lane === "same_sense_near_miss" ? (
          <>
            Close — we’re after a more precise word for this exact meaning:{" "}
            {hint}
          </>
        ) : (
          <>
            That’s a real sentence — but{" "}
            <span className="font-serif italic">{props.typed}</span> means
            something different here.{" "}
            {props.gloss ? (
              <>
                This word means {props.gloss}: {hint}
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
