import type { MasteryState } from "~/domain/mastery/card.js";
import { cn } from "@/lib/utils";

/**
 * Mastery ladder chip (SM-1). Tint ramps with growth; Fluent is the only solid
 * chip (design-system/references/components.md).
 *
 * Recognized tints from `mastery-recognized` (= marigold) but takes its *text* from
 * `marigold-deep`: marigold is a signal tint, not a text color on paper, and the ladder's own
 * ramp rule ("tint deepens with growth") speaks to the fill, not the label.
 */
const STYLES: Record<MasteryState, string> = {
  New: "border-line text-ink-faint",
  Seen: "border-transparent bg-mastery-seen/20 text-mastery-seen",
  Recognized: "border-transparent bg-mastery-recognized/15 text-marigold-deep",
  Productive: "border-transparent bg-mastery-productive/15 text-mastery-productive",
  Fluent: "border-transparent bg-mastery-fluent text-paper-raised",
};

export function MasteryChip({
  state,
  className,
}: {
  state: MasteryState;
  className?: string;
}) {
  return (
    <span
      className={cn(
        // Chips are mono, lowercase, 3px corners — tags on a form, not pills.
        "inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[10.5px] tracking-wide lowercase",
        STYLES[state],
        className,
      )}
    >
      {state}
    </span>
  );
}
