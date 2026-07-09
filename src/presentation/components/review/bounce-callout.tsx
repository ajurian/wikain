import { motion, useReducedMotion } from "motion/react";
import { Info } from "lucide-react";
import type { BounceKind } from "@/types/verdict";

/**
 * Rule-layer bounce callout (RL-2/3/4). Deliberately NEUTRAL — a bounce is not
 * an error and not a review (INV-2): paper-sunken, ink-soft, no red, appears
 * instantly with a bare fade (NET-2: no spinner ever precedes it).
 * Copy: brand/references/voice.md.
 */
export function BounceCallout({
  kind,
  lemma,
}: {
  kind: BounceKind;
  lemma: string;
}) {
  const reduced = useReducedMotion();
  const copy: Record<BounceKind, string> = {
    absent: `Your sentence needs “${lemma}” in it — any form works (${lemma}, ${lemma}d, ${lemma}s…).`,
    degenerate: "Give it a bit more — a full sentence with a few more words.",
    taglish: "Let’s keep this one in English — try rewriting it.",
  };
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      role="status"
      className="flex items-start gap-2.5 rounded-lg bg-paper-sunken px-3.5 py-3"
    >
      <Info className="mt-0.5 size-4 shrink-0 text-ink-faint" strokeWidth={1.5} />
      <p className="text-sm leading-relaxed text-ink-soft">{copy[kind]}</p>
    </motion.div>
  );
}
