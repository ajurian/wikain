/*
 * The free-production writing surface (TIER-6). It deliberately looks and feels like `ClozeSentence`,
 * not like a boxed form field: the four tiers are one dictionary entry, so writing a whole sentence and
 * filling a cloze blank should feel like the same act on the same paper. Both share `SentenceWell` — the
 * always-shaded well with framing double quotes — so cloze↔free parity is structural, not copied.
 *
 * It carries the specimen-sentence cast (italic serif) so what the learner writes reads as a quoted
 * sentence, matching how model/cloze sentences are shown. It is a `bare` Textarea (the box stripped)
 * flexed inside the well — the well owns the padding, tint, quotes, and cursor affordance.
 */
import { SentenceWell } from "@/components/review/sentence-well";
import { Textarea } from "@/components/ui/textarea";

export function SentenceField({
  value,
  onChange,
  disabled,
  autoFocus,
  placeholder,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  "aria-label": string;
}) {
  return (
    <SentenceWell>
      <Textarea
        variant="bare"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="min-h-16 min-w-0 flex-1 font-serif text-xl leading-relaxed text-ink italic placeholder:text-ink-faint placeholder:not-italic"
      />
    </SentenceWell>
  );
}
