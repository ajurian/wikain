import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";
import { DURATION, EASE } from "@/lib/motion";

/** Beyond this the per-unit ticks would be closer than ~4px and read as noise, so they are dropped. */
const MAX_LEGIBLE_TICKS = 12;

/**
 * Daily goal gauge (CNT-8): unit is productive uses (sentences), learner-set.
 *
 * Tick-marked rather than a ring — the gauge reads as a measuring instrument, and the ticks make
 * the unit (one sentence) countable instead of merely proportional. Fills once on mount; never
 * pulses at rest and shows no guilt state when incomplete (CNT-9).
 */
export function GoalGauge({
  done,
  goal,
  className,
}: {
  done: number;
  goal: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const fraction = Math.min(1, goal > 0 ? done / goal : 0);
  const showTicks = goal > 1 && goal <= MAX_LEGIBLE_TICKS;

  return (
    <div className={cn("w-full min-w-36", className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="font-mono text-sm font-medium text-ink tabular-nums">
          {done}
          <span className="text-ink-faint">/{goal}</span>
        </p>
        <p className="font-mono text-[10.5px] tracking-wide text-ink-faint uppercase">sentences</p>
      </div>

      <div className="relative h-2 overflow-hidden rounded-sm border border-line bg-paper-sunken">
        <motion.div
          initial={{ width: reduced ? `${fraction * 100}%` : 0 }}
          animate={{ width: `${fraction * 100}%` }}
          transition={{ duration: DURATION.slow, ease: EASE }}
          className="h-full bg-marigold"
        />
        {/* Unit ticks sit above the fill: 1px rules, the same way every surface here separates. */}
        {showTicks ? (
          <div aria-hidden className="absolute inset-0 flex">
            {Array.from({ length: goal - 1 }, (_, i) => (
              <div key={i} className="flex-1 border-r border-paper-raised/70" />
            ))}
            <div className="flex-1" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
