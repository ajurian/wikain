/*
 * The clozed sentence a learner types the missing word into (TIER-5).
 *
 * The whole sentence is a native `<label>` wrapping the blank, so clicking anywhere in it focuses the
 * input — no `onClick`, no `ref`, no `id`/`htmlFor` (an input that is a descendant of its label is
 * associated implicitly). That is also why the affordance is honest rather than decorative: the target
 * really is the whole sentence, and a keyboard/screen-reader user gets the same association for free.
 *
 * The blank keeps its own `aria-label`, which wins over the label's text for the accessible name — so
 * the field is announced as the blank, not by reading the entire sentence back.
 */
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
    <label
      className={cn(
        // `-mx-3` + `px-3`: the well bleeds past the text so the sentence stays aligned with the rest
        // of the entry, instead of being indented by its own padding.
        "-mx-3 block cursor-text rounded-lg px-3 py-2 transition-colors",
        "hover:bg-paper-sunken focus-within:bg-paper-sunken",
        "font-serif text-xl leading-relaxed text-ink",
        className,
      )}
    >
      {before}
      {children}
      {after}
    </label>
  );
}
