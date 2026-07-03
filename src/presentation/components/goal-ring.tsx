import { motion, useReducedMotion } from "motion/react";

/**
 * Daily goal ring (CNT-8): unit is productive uses (sentences), learner-set.
 * Fills once on mount; no pulse when incomplete, no guilt state (CNT-9).
 */
export function GoalRing({ done, goal, size = 96 }: { done: number; goal: number; size?: number }) {
  const reduced = useReducedMotion();
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fraction = Math.min(1, goal > 0 ? done / goal : 0);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-paper-sunken"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduced ? c * (1 - fraction) : c }}
          animate={{ strokeDashoffset: c * (1 - fraction) }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
          className="stroke-amber"
        />
      </svg>
      <div className="absolute text-center">
        <p className="font-serif text-lg font-semibold text-ink tabular-nums">
          {done}
          <span className="text-ink-faint">/{goal}</span>
        </p>
        <p className="text-[10px] font-medium tracking-wide text-ink-faint uppercase">sentences</p>
      </div>
    </div>
  );
}
