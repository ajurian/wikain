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
import type { CoarseLevel } from "../../domain/placement.js";
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
    <div className="space-y-2.5">
      {COARSE_LEVEL_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          disabled={disabled}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "w-full rounded-lg border px-4 py-3 text-left transition-colors duration-150 disabled:opacity-60",
            value === option.id
              ? "border-amber-deep bg-amber-wash"
              : "border-line bg-paper-raised hover:border-ink-faint",
          )}
        >
          <p className="text-sm font-medium text-ink">{option.label}</p>
          <p className="mt-0.5 text-xs text-ink-faint">{option.detail}</p>
        </button>
      ))}
    </div>
  );
}
