/*
 * A specimen sentence — the language in play shown as a complete utterance (a model/example sentence).
 *
 * The review card mixes three kinds of text in the serif "language" voice: definitions (a gloss/meaning),
 * specimen sentences (a full example), and — in sans — the instrument's own copy. Sharing one serif
 * voice made a sentence and a definition read alike at a glance. So a SENTENCE gets a distinct cast:
 * italic serif wrapped in typographic double quotes. A definition stays upright serif (`EntryDefinition`);
 * instrument copy stays sans. The quote glyphs are decorative framing (ink-faint, `aria-hidden`) — the
 * sentence text carries the meaning.
 */
import { cn } from "@/lib/utils";

export function Sentence({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        // Hanging opening quote: a negative first-line indent lets the “ hang left of the text column
        // so wrapped lines align under the sentence's first glyph, not under the quote.
        "font-serif text-xl leading-relaxed text-ink italic [text-indent:-0.5em]",
        className,
      )}
    >
      <span aria-hidden className="not-italic text-ink-faint">
        &ldquo;
      </span>
      {children}
      <span aria-hidden className="not-italic text-ink-faint">
        &rdquo;
      </span>
    </p>
  );
}
