import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { resolveEdits, type ResolvedEdit } from "~/domain/review/editResolution.js";
import type { Replacement } from "@/types/verdict";
import { cn } from "@/lib/utils";

/**
 * EDIT-7: the judge's replacements rendered inline on the learner's OWN
 * sentence — strikethrough `find` + inserted `replace`, color-coded by reason.
 * Tapping a span reveals that edit's one_line_feedback on demand (never the
 * primary surface). Span resolution reuses the pure domain resolver
 * (EDIT-3/4/5/6); on fallback the whole corrected_sentence is shown (EDIT-4).
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
        <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">
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
    segments.push(
      <motion.button
        key={`e${i}`}
        type="button"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, delay: reduced ? 0 : i * 0.04 }}
        onClick={() => setOpenEdit(openEdit === i ? null : i)}
        className={cn("cursor-pointer rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50", color)}
        aria-label={`Edit: ${edit.find} → ${edit.replace || "(remove)"}`}
      >
        <del className="decoration-2">{edit.find}</del>
        {edit.replace ? <ins className="ml-1 font-medium no-underline">{edit.replace}</ins> : null}
      </motion.button>,
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
          transition={{ duration: 0.15 }}
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
