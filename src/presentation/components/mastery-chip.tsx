import type { MasteryState } from "../../domain/card.js";
import { cn } from "@/lib/utils";

/**
 * Mastery ladder chip (SM-1). Tint ramps with growth; Fluent is the only solid
 * chip (design-system/references/components.md).
 */
const STYLES: Record<MasteryState, string> = {
  New: "border-line text-ink-faint",
  Seen: "border-transparent bg-mastery-seen/20 text-mastery-seen",
  Recognized: "border-transparent bg-mastery-recognized/15 text-mastery-recognized",
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
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium lowercase",
        STYLES[state],
        className,
      )}
    >
      {state}
    </span>
  );
}
