import { motion, useReducedMotion } from "motion/react";

/**
 * "Checking…" (NET-2). Rendered ONLY after the rule layer passes — never for
 * bounces or deterministic tiers. The one looping animation in the app
 * (besides ring fill); collapses to static text under reduced motion.
 */
export function CheckingIndicator() {
  const reduced = useReducedMotion();
  return (
    <div role="status" className="flex items-center gap-2 px-1 py-2 text-sm text-ink-soft">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-ink-faint"
            animate={reduced ? undefined : { opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </span>
      Checking…
    </div>
  );
}
