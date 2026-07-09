import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

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
      duration: 0.6,
      ease: [0.25, 0.1, 0.25, 1],
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
      <span ref={ref} className="font-serif text-5xl font-semibold text-ink tabular-nums">
        {display}
      </span>
      <p className="mt-1 text-sm font-medium text-ink-soft">Words you can use</p>
      {faded ? (
        <p className="mt-0.5 text-xs text-ink-faint">
          Some words faded — reviewing brings them back.
        </p>
      ) : null}
    </div>
  );
}
