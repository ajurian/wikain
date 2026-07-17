/*
 * The coarse self-report — SEED-2 mechanism (i)'s low-friction instrument, and the one SEED-4 sanctions
 * outright for a self-aware learner ("a full LexTALE run MAY be optional").
 *
 * Shared by `/onboarding`'s level step and `/placement`'s retune, which ask the SAME three questions for the
 * same reason: the option copy is one thing that changes for one reason (PRAG-3), so it lives here once.
 * Headings and CTAs stay at each call site — onboarding asks how writing feels at work, the retune asks how
 * it feels *now*.
 *
 * Presentational only: it never persists. The level→band mapping is domain policy
 * (`frontierBandForCoarseLevel`), applied server-side, so no client can nominate a frontier.
 */
import type { CoarseLevel } from "~/domain/placement/placement.js";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export interface CoarseLevelOption {
  id: CoarseLevel;
  label: string;
  detail: string;
}

export const COARSE_LEVEL_OPTIONS: readonly CoarseLevelOption[] = [
  {
    id: "b1",
    label: "I manage, but writing takes effort",
    detail: "emails are slow, words feel just out of reach",
  },
  {
    id: "b2",
    label: "I write comfortably, but plainly",
    detail: "clear messages — I want more precise, formal range",
  },
  {
    id: "c1",
    label: "I write well and want the last 10%",
    detail: "polish, nuance, academic and professional vocabulary",
  },
];

export interface CoarseLevelPickerProps {
  /** The currently-selected level, or `null` for no selection (a new learner, or an unmappable band). */
  value: CoarseLevel | null;
  onChange: (level: CoarseLevel) => void;
  disabled?: boolean;
}

export function CoarseLevelPicker({ value, onChange, disabled = false }: CoarseLevelPickerProps) {
  return (
    // One exclusive choice — a real radio group, so arrow keys move between options and the
    // selection is announced as such rather than as three independent pressed buttons.
    <RadioGroup
      value={value ?? undefined}
      onValueChange={(v) => onChange(v as CoarseLevel)}
      disabled={disabled}
      className="gap-2.5"
    >
      {COARSE_LEVEL_OPTIONS.map((option) => (
        <Label
          key={option.id}
          htmlFor={`coarse-level-${option.id}`}
          className={cn(
            "flex w-full cursor-pointer items-start gap-3 rounded-md border px-4 py-3 font-normal transition-colors duration-150",
            "has-disabled:cursor-not-allowed has-disabled:opacity-60",
            value === option.id
              ? "border-marigold-deep bg-marigold-wash"
              : "border-line bg-paper-raised hover:border-ink-faint",
          )}
        >
          <RadioGroupItem
            id={`coarse-level-${option.id}`}
            value={option.id}
            className="mt-0.5"
          />
          <span className="block">
            <span className="block text-sm font-medium text-ink">{option.label}</span>
            <span className="mt-0.5 block text-xs text-ink-faint">{option.detail}</span>
          </span>
        </Label>
      ))}
    </RadioGroup>
  );
}
