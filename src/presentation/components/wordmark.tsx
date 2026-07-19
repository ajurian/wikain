import iconUrl from "../icon.svg?url";
import { cn } from "@/lib/utils";

/**
 * Brand wordmark lockup: the icon mark set beside lowercase Source Serif 4, with the marigold
 * terminal period ("something said"). The period takes `marigold-deep`, not `marigold`: it renders
 * as a text glyph on paper, and `marigold-deep` is the contrast-safe on-paper tint. The mark is
 * sized in `em` so it tracks the wordmark's font size at every call site (`text-xl`, `text-3xl`, …);
 * `alt=""` keeps it decorative since the name text carries the accessible label.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.25em] font-serif font-semibold tracking-tight text-ink",
        className,
      )}
    >
      <img src={iconUrl} alt="" className="h-[2em] w-[2em]" />
      <span className="">wikain</span>
    </span>
  );
}
