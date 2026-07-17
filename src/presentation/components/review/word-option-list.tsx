/*
 * The recognition MCQ's four word options (TIER-2), as a real radio group: one tab stop, arrow keys move
 * the selection, `1`–`4` jump to an option. Selecting is not answering — the learner confirms with the
 * card's Check button, like every other tier.
 *
 * Radix's `RadioGroup` primitive is imported directly rather than through `ui/radio-group.tsx`, whose
 * `RadioGroupItem` bakes in a `size-4 rounded-full` dot. A full-width option row needs the whole control
 * to be the target, and the numeral is the selection affordance.
 */
import { useRef } from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

export function WordOptionList({
  options,
  value,
  onChange,
  graded,
  disabled,
  correct,
  labelledBy,
}: {
  options: readonly string[];
  value: string | null;
  onChange: (option: string) => void;
  graded: boolean;
  disabled: boolean;
  /** The target word — known only after grading, so `null` until then. */
  correct: string | null;
  labelledBy: string;
}) {
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  /** `1`–`4` select the nth *displayed* option (the list is shuffled per mount). */
  const handleDigit = (event: React.KeyboardEvent) => {
    const n = Number(event.key);
    if (!Number.isInteger(n) || n < 1 || n > options.length) return;
    event.preventDefault();
    onChange(options[n - 1]!);
    items.current[n - 1]?.focus();
  };

  return (
    <RadioGroupPrimitive.Root
      aria-labelledby={labelledBy}
      value={value ?? ""}
      onValueChange={onChange}
      disabled={disabled}
      onKeyDown={handleDigit}
      className="grid gap-2.5"
    >
      {options.map((option, i) => {
        const isCorrect = correct !== null && option.toLowerCase() === correct.toLowerCase();
        const isChosen = option === value;
        return (
          <RadioGroupPrimitive.Item
            key={option}
            ref={(node) => {
              items.current[i] = node;
            }}
            value={option}
            className={cn(
              "flex min-h-11 w-full items-center gap-3 rounded-lg border border-line bg-paper-raised px-4 py-2.5 text-left transition-colors duration-150",
              "outline-none focus-visible:border-marigold-deep focus-visible:ring-[3px] focus-visible:ring-marigold-deep/40",
              !graded && "hover:border-ink-faint data-[state=checked]:border-ink",
              !graded && "data-[state=checked]:bg-paper-sunken",
              graded && isCorrect && "border-moss bg-moss-wash",
              graded && isChosen && !isCorrect && "border-terracotta bg-terra-wash",
              graded && !isChosen && !isCorrect && "opacity-50",
            )}
          >
            <span aria-hidden className="w-3 text-xs text-ink-faint tabular-nums">
              {i + 1}
            </span>
            <span className="font-serif text-lg text-ink">{option}</span>
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}
