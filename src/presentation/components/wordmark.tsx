import iconLightUrl from "../iconLight.svg?url";
import iconDarkUrl from "../iconDark.svg?url";
import { cn } from "@/lib/utils";

/**
 * Brand wordmark lockup: the icon mark set beside lowercase Source Serif 4, with the marigold
 * terminal period ("something said"). The period takes `marigold-deep`, not `marigold`: it renders
 * as a text glyph on paper, and `marigold-deep` is the contrast-safe on-paper tint. The mark is
 * sized in `em` so it tracks the wordmark's font size at every call site (`text-xl`, `text-3xl`, …);
 * `alt=""` keeps it decorative since the name text carries the accessible label.
 *
 * The mark inverts with the *effective* theme via the `.dark` class rather than `useTheme()`: the
 * class is already resolved for all three preferences (`light|dark|system`) and set pre-paint by
 * `THEME_INIT_SCRIPT` (see `lib/theme.tsx`), so a pure CSS swap is flash-free, SSR-safe, and works
 * on signed-out routes where the `ThemeProvider` isn't in scope. Both marks are rendered; the
 * `.dark` class picks one.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.25em] font-serif font-semibold tracking-tight text-ink",
        className,
      )}
    >
      <img src={iconLightUrl} alt="" className="h-[2em] w-[2em] dark:hidden" />
      <img src={iconDarkUrl} alt="" className="hidden h-[2em] w-[2em] dark:block" />
      <span className="">wikain</span>
    </span>
  );
}
