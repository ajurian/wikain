import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import { DURATION, EASE, EDIT_STAGGER } from "@/lib/motion";
import { resolveEdits, type ResolvedEdit } from "~/domain/review/editResolution.js";
import type { Replacement } from "@/types/verdict";
import { cn } from "@/lib/utils";

/**
 * EDIT-7: the judge's replacements rendered inline on the learner's OWN
 * sentence — strikethrough `find` + inserted `replace`, color-coded by reason.
 * Tapping a span reveals that edit's one_line_feedback on demand (never the
 * primary surface). Span resolution reuses the pure domain resolver
 * (EDIT-3/4/5/6); on fallback the whole corrected_sentence is shown (EDIT-4).
 *
 * Each edit is a `span[role=button]`, NOT a `<button>` — the third sanctioned exception to
 * "reach for the primitive first" (see `blank-input.tsx` / `word-option-list.tsx`). A `<button>`
 * is `inline-block`, so it cannot fragment across line boxes: a multi-word edit became one atomic
 * box that wrapped its own text internally, and the UA stylesheet's `text-align: center` — which
 * the paragraph's alignment does not override — centered that text. The result was a centered,
 * ragged block sitting inside a left-aligned paragraph. This must read as ONE paragraph that
 * happens to carry color and strikes, so the interactive element has to be a true inline box.
 */

const REASON_TEXT: Record<Replacement["reason"], string> = {
  sense: "text-reason-sense",
  grammar: "text-reason-grammar",
  collocation: "text-reason-collocation",
  register: "text-reason-register",
};

export function EditedSentence({
  rawSentence,
  replacements,
  correctedSentence,
}: {
  rawSentence: string;
  replacements: Replacement[];
  correctedSentence?: string;
}) {
  const reduced = useReducedMotion();
  const [openEdit, setOpenEdit] = useState<number | null>(null);

  const resolution = useMemo(
    () => resolveEdits(rawSentence, replacements, correctedSentence ?? rawSentence),
    [rawSentence, replacements, correctedSentence],
  );

  // one_line_feedback lives on the mock replacement; look it up by `find`.
  const feedbackFor = (edit: ResolvedEdit) =>
    replacements.find((r) => r.find === edit.find)?.oneLineFeedback;

  if (resolution.kind === "fallback") {
    return (
      <div className="space-y-1.5">
        <p className="font-mono text-[10.5px] tracking-wide text-ink-faint uppercase">
          Suggested rewrite
        </p>
        <p className="font-serif text-xl leading-relaxed text-ink">
          {resolution.correctedSentence}
        </p>
      </div>
    );
  }

  // Domain resolver returns edits sorted right-to-left (EDIT-5); render left-to-right.
  const edits = [...resolution.edits].sort((a, b) => a.start - b.start);
  const segments: React.ReactNode[] = [];
  let cursor = 0;
  edits.forEach((edit, i) => {
    if (edit.start > cursor) {
      segments.push(<span key={`t${i}`}>{rawSentence.slice(cursor, edit.start)}</span>);
    }
    const color = REASON_TEXT[edit.reason];
    const toggle = () => setOpenEdit(openEdit === i ? null : i);
    segments.push(
      <motion.span
        key={`e${i}`}
        role="button"
        tabIndex={0}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATION.base, ease: EASE, delay: reduced ? 0 : i * EDIT_STAGGER }}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault(); // Space would scroll the page out from under the sentence.
            toggle();
          }
        }}
        className={cn(
          // `box-decoration-clone`: the ring/rounding are drawn on EACH line box an edit spans,
          // rather than once around the whole run — an edit that wraps mid-phrase is normal here.
          "cursor-pointer rounded-sm box-decoration-clone focus-visible:ring-2 focus-visible:ring-ring/50",
          color,
        )}
        aria-label={`Edit: ${edit.find} → ${edit.replace || "(remove)"}`}
      >
        <del className="decoration-2">{edit.find}</del>
        {/* A real space, not `ml-1`: a margin is not a line-break opportunity, so a long edit could
            not wrap between the deletion and the insertion. */}
        {edit.replace ? (
          <>
            {" "}
            <ins className="font-medium no-underline">{edit.replace}</ins>
          </>
        ) : null}
      </motion.span>,
    );
    cursor = edit.end;
  });
  if (cursor < rawSentence.length) {
    segments.push(<span key="tail">{rawSentence.slice(cursor)}</span>);
  }

  const open = openEdit !== null ? edits[openEdit] : undefined;

  return (
    <div className="space-y-2">
      <p className="font-serif text-xl leading-relaxed text-ink">{segments}</p>
      {open ? (
        <motion.p
          key={openEdit}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATION.fast, ease: EASE }}
          className={cn("text-sm leading-relaxed", REASON_TEXT[open.reason])}
        >
          {feedbackFor(open) ?? `${open.find} → ${open.replace}`}
        </motion.p>
      ) : edits.length > 0 ? (
        <p className="text-xs text-ink-faint">Tap an edit to see why.</p>
      ) : null}
    </div>
  );
}
