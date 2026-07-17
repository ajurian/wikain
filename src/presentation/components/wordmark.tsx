import { cn } from "@/lib/utils";

/**
 * Brand wordmark: lowercase Source Serif 4, marigold terminal period ("something said").
 * The period takes `marigold-deep`, not `marigold`: it renders as a text glyph on paper, and
 * `marigold-deep` is the contrast-safe on-paper tint.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-serif font-semibold tracking-tight text-ink", className)}>
      wikain<span className="text-marigold-deep">.</span>
    </span>
  );
}
