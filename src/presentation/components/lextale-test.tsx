/*
 * The LexTALE placement instrument, rendered (spec/09 SEED-4). An untimed yes/no lexical decision over the
 * 3 published practice items then the 60 scored ones, one at a time.
 *
 * The nonwords are the point: a learner who answers "yes" to everything scores 50, not 67 (see
 * `scoreLexTale`). So the copy must NOT nudge toward "yes" — the two buttons are given equal visual weight,
 * and neither is styled as the primary action.
 *
 * Answers are collected here and posted RAW; the scalar is computed server-side (`submitLexTaleFn`), since
 * it moves the learner's frontier band. This component never scores and never sees a score.
 */
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { LEXTALE_ITEMS, LEXTALE_PRACTICE_ITEMS } from "~/domain/placement/lextale.js";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export interface LexTaleTestProps {
  /** Called once, with one boolean per scored item (`true` = "I know this word"). Practice is dropped. */
  onFinish: (answers: Record<string, boolean>) => void;
  onCancel: () => void;
  /** Set while the answers are in flight to the server, so the last tap can't double-submit. */
  submitting?: boolean;
}

/** Practice first (unscored, so a learner meets a nonword before it counts), then the 60 real items. */
const SEQUENCE = [
  ...LEXTALE_PRACTICE_ITEMS.map((i) => ({ item: i.item, practice: true })),
  ...LEXTALE_ITEMS.map((i) => ({ item: i.item, practice: false })),
];

export function LexTaleTest({ onFinish, onCancel, submitting = false }: LexTaleTestProps) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});

  // `index` never escapes [0, SEQUENCE.length): `answer` calls `onFinish` instead of advancing past the
  // last item. The guard exists only to satisfy `noUncheckedIndexedAccess` without a non-null assertion.
  const current = SEQUENCE[index];
  if (current === undefined) return null;
  const scoredSoFar = Math.max(0, index - LEXTALE_PRACTICE_ITEMS.length);

  function answer(knows: boolean) {
    if (submitting || current === undefined) return;
    const next = current.practice ? answers : { ...answers, [current.item]: knows };
    setAnswers(next);

    if (index + 1 < SEQUENCE.length) {
      setIndex(index + 1);
      return;
    }
    onFinish(next);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">
            {current.practice ? "practice" : "placement test"}
          </p>
          <p className="text-xs text-ink-faint tabular-nums">
            {current.practice ? "—" : `${scoredSoFar + 1} / ${LEXTALE_ITEMS.length}`}
          </p>
        </div>
        <Progress value={current.practice ? 0 : scoredSoFar} max={LEXTALE_ITEMS.length} />
      </div>

      <p className="text-sm leading-relaxed text-ink-soft">
        Some of these are real English words and some are not. Answer honestly — saying yes to everything
        scores the same as saying no to everything.
      </p>

      <div className="flex min-h-28 items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={current.item}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="font-serif text-4xl font-semibold text-ink"
          >
            {current.item}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Equal weight, both `outline`: a primary-styled "I know it" would bias the yes/no decision. */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" size="lg" disabled={submitting} onClick={() => answer(false)}>
          Not a word
        </Button>
        <Button variant="outline" size="lg" disabled={submitting} onClick={() => answer(true)}>
          I know it
        </Button>
      </div>

      {current.practice ? (
        <p className="text-center text-xs text-ink-faint">
          Practice — these three don’t count toward your result.
        </p>
      ) : null}

      <button
        type="button"
        onClick={onCancel}
        disabled={submitting}
        className="mx-auto block text-xs text-ink-faint underline-offset-4 hover:underline disabled:opacity-50"
      >
        Stop the test
      </button>
    </div>
  );
}
