import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";

import { DURATION, EASE } from "@/lib/motion";
import { ArrowRight, MoveDown, MoveUp } from "lucide-react";
import { dashboardSummaryFn } from "@/server/dashboard";
import { MasteryChip } from "@/components/mastery-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { MasteryState } from "~/domain/mastery/card.js";
import type { StepOutcome } from "./session-summary";

const ORDER: MasteryState[] = ["New", "Seen", "Recognized", "Productive", "Fluent"];
function isUp(moved: { from: MasteryState; to: MasteryState }): boolean {
  return ORDER.indexOf(moved.to) > ORDER.indexOf(moved.from);
}

/** The batch summary line (BAT-9): honest counts, no streaks — e.g. "3 words produced, 1 promoted." */
function summaryLine(results: StepOutcome[], total: number): string {
  const produced = results.filter((r) => r.judged).length;
  const promoted = results.filter((r) => r.moved && isUp(r.moved)).length;
  const parts: string[] = [];
  if (produced > 0) parts.push(`${produced} ${produced === 1 ? "word" : "words"} produced`);
  if (promoted > 0) parts.push(`${promoted} promoted`);
  if (parts.length === 0) {
    // A resumed seam has no client-held results (they were summary copy, not the record) — the
    // batch's completed size is still honest.
    const done = Math.max(results.length, total);
    return `${done} ${done === 1 ? "card" : "cards"} reviewed.`;
  }
  return `${parts.join(", ")}.`;
}

/**
 * The completion seam between mini-session batches (spec/14 BAT-9): the completion beat, the batch
 * summary, today's goal — shown HERE only, never as a second live meter during cards — and the
 * explicit Continue / Done choice. Calm by design: a fade + rise entrance, no confetti (brand hard
 * rule); the early reward is the seam itself.
 */
export function BatchSeam({
  results,
  total,
  busy,
  onChoose,
}: {
  results: StepOutcome[];
  /** The completed batch's size — the summary fallback when results were lost to a reload. */
  total: number;
  busy: boolean;
  onChoose: (choice: "continue" | "done") => void;
}) {
  const reduced = useReducedMotion();
  // CNT-8 at the seam only (BAT-9): fetched when the seam renders, never during cards. The same
  // read also answers whether due cards remain, so Continue is offered only when it can serve one.
  const goal = useQuery({
    queryKey: ["dashboard-summary", "seam"],
    queryFn: () => dashboardSummaryFn(),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const moved = results.filter((r) => r.moved);
  const hasMoreDue = goal.data === undefined ? true : goal.data.dueReviews > 0;

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DURATION.base, ease: EASE }}
      className="w-full space-y-6"
    >
      <div>
        <h1 className="text-xl font-semibold text-ink">Set complete.</h1>
        <p className="mt-1 text-sm text-ink-soft">{summaryLine(results, total)}</p>
      </div>

      {moved.length > 0 ? (
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="font-mono text-[10.5px] tracking-wide text-ink-faint uppercase">
              Words that moved
            </p>
            {moved.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-ink-soft">
                {isUp(r.moved!) ? (
                  <MoveUp className="size-4 text-moss" strokeWidth={1.75} />
                ) : (
                  <MoveDown className="size-4 text-terracotta" strokeWidth={1.75} />
                )}
                <span className="font-serif italic">{r.lemma}</span>
                <MasteryChip state={r.moved!.from} />
                <ArrowRight className="size-3 text-ink-faint" />
                <MasteryChip state={r.moved!.to} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {goal.data ? (
        <Card>
          <CardContent className="flex items-baseline justify-between p-5">
            <p className="text-sm text-ink-soft">Today’s goal</p>
            <p className="font-mono text-sm text-ink tabular-nums">
              {goal.data.sentencesToday}/{goal.data.dailyGoal}
              <span className="ml-1.5 text-ink-faint"> sentences</span>
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-3">
        {hasMoreDue ? (
          <Button
            size="lg"
            className="h-12 w-full"
            disabled={busy}
            onClick={() => onChoose("continue")}
            autoFocus
          >
            Continue <ArrowRight data-slot="icon" />
          </Button>
        ) : null}
        <Button
          size="lg"
          variant="outline"
          className="h-12 w-full"
          disabled={busy}
          onClick={() => onChoose("done")}
          {...(hasMoreDue ? {} : { autoFocus: true })}
        >
          Done for now
        </Button>
      </div>
    </motion.div>
  );
}
