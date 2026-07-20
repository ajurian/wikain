/*
 * The shaded well that hosts a specimen sentence the learner acts on — the cloze sentence (`ClozeSentence`)
 * and the free-production writing surface (`SentenceField`). Both are the SAME dictionary entry shown as one
 * act on the same paper, so they MUST share one well: the container tint/padding/radius and the two framing
 * quotes live here, once, and the two callers differ only in what sits between the quotes (an inline blank vs
 * a whole textarea). Extracted after the two drifted apart (cloze hung its quote via `text-indent` while free
 * framed it in a flex column, so their text started at different x) — a shared well is what keeps the inline
 * padding identical by construction.
 *
 * The well is **always shaded** (sunken paper): a quotation has presence whether or not it is focused. The
 * quotes **frame** the content — opening at the top-left (`self-start`), closing at the bottom-right
 * (`self-end`) — which is how a quotation reads around a block that cannot be closed inline. `items-stretch`
 * is what lets the quotes pin to the row's top and bottom.
 *
 * `label` renders the well as a native `<label>` (cloze needs it so clicking anywhere focuses the blank via
 * implicit association); the default `<div>` is for the textarea surface, which owns its own focus.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const quoteClass =
  "shrink-0 font-serif text-xl leading-relaxed text-ink-faint select-none";

export function SentenceWell({
  children,
  label,
  className,
}: {
  children: ReactNode;
  /** Render as `<label>` (cloze) rather than `<div>` (free production). */
  label?: boolean;
  className?: string;
}) {
  const Tag = label ? "label" : "div";
  return (
    <Tag
      className={cn(
        // `-mx-3` + `px-3` bleed keeps the text aligned with the rest of the entry while the shaded well
        // extends past it. Always shaded (not only on hover/focus). `items-stretch` lets the quotes pin
        // to the row's top/bottom.
        "-mx-3 flex cursor-text items-stretch gap-1 rounded-lg bg-paper-sunken px-3 py-2",
        className,
      )}
    >
      <span aria-hidden className={cn(quoteClass, "self-start")}>
        &ldquo;
      </span>
      {children}
      <span aria-hidden className={cn(quoteClass, "self-end")}>
        &rdquo;
      </span>
    </Tag>
  );
}
