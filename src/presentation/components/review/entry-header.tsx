/*
 * The masthead of a dictionary entry: headword slot, italic part of speech, and the hairline "entry rule"
 * that separates the two from the definition below. Every review tier wears it, which is what makes the
 * four tiers read as one artifact — the same word being looked at from four distances.
 *
 * The headword is a slot (`children`), not a string, because three of the four tiers do not have the word
 * to show: recognition fills it with the learner's provisional pick, cloze mirrors what they type, and cued
 * makes it the input itself. `heading` is the visually-hidden name of the card — the visible headword is
 * often a blank, which is not something a screen reader can announce.
 */
import type { ControlledPos } from "~/domain/lexicalItem.js";
import { PosLabel } from "./pos-label";
import { cn } from "@/lib/utils";

export function EntryHeader({
  pos,
  heading,
  children,
}: {
  pos: ControlledPos;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <header className="border-b border-line pb-3">
      <h1 className="sr-only">{heading}</h1>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className="min-w-0 font-serif text-4xl leading-tight font-semibold text-ink">
          {children}
        </div>
        <PosLabel pos={pos} />
      </div>
    </header>
  );
}

/** The unanswered headword: a rule where the word will be. Zero-height so it sits on the baseline. */
export function HeadwordBlank({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block w-32 border-b-2 border-ink-faint align-baseline",
        className,
      )}
    />
  );
}

/** The definition body of an entry — the gloss, the intended sense, or the clozed sentence. */
export function EntryDefinition({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      id={id}
      className={cn("font-serif text-lg leading-relaxed text-ink", className)}
    >
      {children}
    </p>
  );
}
