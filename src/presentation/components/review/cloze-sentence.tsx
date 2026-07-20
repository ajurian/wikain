/*
 * The clozed sentence a learner types the missing word into (TIER-5).
 *
 * The whole sentence is a native `<label>` (via `SentenceWell label`) wrapping the blank, so clicking
 * anywhere in it focuses the input — no `onClick`, no `ref`, no `id`/`htmlFor` (an input that is a
 * descendant of its label is associated implicitly). That is also why the affordance is honest rather than
 * decorative: the target really is the whole sentence, and a keyboard/screen-reader user gets the same
 * association for free.
 *
 * It shares `SentenceWell` with `SentenceField` so cloze and free production render as the same act on the
 * same paper — identical shaded well, framing quotes, and inline padding. The middle column carries the
 * specimen-sentence cast (italic serif); the typed blank shares the italic (`BlankInput inline`), so a
 * completed line reads as one sentence.
 *
 * The blank keeps its own `aria-label`, which wins over the label's text for the accessible name — so the
 * field is announced as the blank, not by reading the entire sentence back.
 */
import { SentenceWell } from "@/components/review/sentence-well";
import { cn } from "@/lib/utils";

export function ClozeSentence({
  clozedSentence,
  className,
  children,
}: {
  /** `docs/BUILD.md` §7.1: exactly one `_` — the blank is where `children` goes. */
  clozedSentence: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [before, after] = clozedSentence.split("_");

  return (
    <SentenceWell label>
      <span
        className={cn(
          "min-w-0 flex-1 font-serif text-xl leading-relaxed text-ink italic",
          className,
        )}
      >
        {before}
        {children}
        {after}
      </span>
    </SentenceWell>
  );
}
