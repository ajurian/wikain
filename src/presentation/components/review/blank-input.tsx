/*
 * The blank a learner types the target word into — a rule that grows with the word, whether it sits at the
 * headword of the entry (cued) or inside a clozed sentence (cloze).
 *
 * Width comes from an invisible mirror span sharing one CSS-grid cell with the input, not from
 * `field-sizing: content` (Chromium-only as of 2026) and not from JS measurement. The mirror is styled
 * identically to the input, so the cell is exactly as wide as the text — no ResizeObserver, no reflow loop.
 */
import { cn } from "@/lib/utils";

export type BlankInputVariant = "headword" | "inline";

/** The mirror MUST match the input in font, size, weight, tracking, and horizontal padding. */
const TYPE: Record<BlankInputVariant, string> = {
  headword: "font-serif text-4xl leading-tight font-semibold",
  inline: "font-serif text-xl leading-relaxed",
};

const MIN_WIDTH: Record<BlankInputVariant, string> = {
  headword: "min-w-32",
  inline: "min-w-24",
};

export interface BlankInputProps extends Omit<
  React.ComponentProps<"input">,
  "size" | "type"
> {
  variant: BlankInputVariant;
  value: string;
  /** Required: the placeholder is a hint, never the accessible name. */
  "aria-label": string;
}

export function BlankInput({
  variant,
  value,
  className,
  ...props
}: BlankInputProps) {
  return (
    <span
      className={cn(
        "relative inline-grid max-w-full align-baseline",
        MIN_WIDTH[variant],
      )}
    >
      {/*
       * No `overflow-hidden` here: a grid container with non-visible overflow has no baseline, so the blank
       * would sink off the line it sits on. The runaway-width guard is `break-all` on the mirror instead —
       * an absurdly long entry wraps the (invisible) mirror rather than widening the page.
       */}
      <span
        aria-hidden
        className={cn(
          "invisible col-start-1 row-start-1 px-1 break-all whitespace-pre-wrap",
          TYPE[variant],
        )}
      >
        {value === "" ? " " : value}
      </span>
      <input
        {...props}
        value={value}
        type="text"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        className={cn(
          "col-start-1 row-start-1 w-full border-b-2 border-ink-faint bg-transparent px-1 text-ink outline-none",
          "caret-amber-deep placeholder:text-ink-faint/70",
          "focus-visible:border-amber-deep",
          "disabled:cursor-not-allowed disabled:opacity-60",
          TYPE[variant],
          className,
        )}
      />
    </span>
  );
}

/** The same blank after grading: the learner's answer, tinted, holding its place in the line. */
export function BlankAnswer({
  variant,
  passed,
  children,
}: {
  variant: BlankInputVariant;
  passed: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-block border-b-2 px-1 align-baseline",
        TYPE[variant],
        passed ? "border-moss text-moss" : "border-terracotta text-terracotta",
      )}
    >
      {children}
    </span>
  );
}
