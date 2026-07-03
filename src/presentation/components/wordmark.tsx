import { cn } from "@/lib/utils";

/** Brand wordmark: lowercase Fraunces, amber terminal period ("something said"). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-serif font-semibold tracking-tight text-ink", className)}>
      wikain<span className="text-amber-deep">.</span>
    </span>
  );
}
