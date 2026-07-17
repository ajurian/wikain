import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

import { DURATION, EASE } from "@/lib/motion";

/**
 * "Words you can use" — the headline metric (CNT-2/3/4). Honest by design:
 * decreases animate identically to increases, no alarm styling.
 */
export function CounterStat({
  value,
  previous,
}: {
  value: number;
  /** e.g. yesterday's value; when lower than value it renders the quiet fade caption */
  previous?: number;
}) {
  const reduced = useReducedMotion();
  const [animated, setAnimated] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reduced) return;
    const controls = animate(0, value, {
      duration: DURATION.slow,
      ease: EASE,
      onUpdate: (v) => setAnimated(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, reduced]);

  // Derived, not synchronised: under reduced motion the final value IS the render output, so no
  // effect has to push it into state (react-hooks/set-state-in-effect).
  const display = reduced ? value : animated;

  const faded = previous !== undefined && previous > value;

  return (
    <div>
      {/* Mono is the instrument measuring (P1): every count reads in the measuring voice. */}
      <span ref={ref} className="font-mono text-[40px] leading-none font-medium text-ink tabular-nums">
        {display}
      </span>
      <p className="mt-1 text-sm font-medium text-nowrap text-ink-soft">Words you can use</p>
      {faded ? (
        <p className="mt-0.5 text-xs text-ink-faint">
          Some words faded — reviewing brings them back.
        </p>
      ) : null}
    </div>
  );
}
