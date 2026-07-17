import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";

import { DURATION, EASE } from "@/lib/motion";
import { ArrowRight, MoveDown, MoveUp } from "lucide-react";
import { MasteryChip } from "@/components/mastery-chip";
import type { MasteryState } from "~/domain/mastery/card.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export interface StepOutcome {
  lemma: string;
  tier: string;
  outcome: "pass" | "fail" | "skip";
  moved?: { from: MasteryState; to: MasteryState };
  /** counted toward the daily goal (a free judged production — CNT-8/INV-4) */
  judged?: boolean;
}

/**
 * End-of-session summary. Promotions and demotions get EQUAL visual weight
 * (honest progress, CNT-1/CNT-4); goal progress counts only judged productions
 * (INV-4). No confetti (brand hard rule).
 */
export function SessionSummary({ results }: { results: StepOutcome[] }) {
  const reduced = useReducedMotion();
  const judged = results.filter((r) => r.judged);
  const moved = results.filter((r) => r.moved);
  const skipped = results.filter((r) => r.outcome === "skip");

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.base, ease: EASE }}
      className="w-full space-y-6"
    >
      <div>
        <h1 className="text-xl font-semibold text-ink">Session done.</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {judged.length > 0
            ? `${judged.length} sentence${judged.length === 1 ? "" : "s"} checked — they count toward today’s goal.`
            : "No judged sentences this time — the goal counts only real productions."}
        </p>
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

      {skipped.length > 0 ? (
        <p className="text-sm text-ink-soft">
          Skipped: {skipped.map((r) => r.lemma).join(", ")} — still due, no rating taken.
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button asChild size="lg">
          <Link to="/">Back home</Link>
        </Button>
      </div>
    </motion.div>
  );
}

const ORDER: MasteryState[] = ["New", "Seen", "Recognized", "Productive", "Fluent"];
function isUp(moved: { from: MasteryState; to: MasteryState }): boolean {
  return ORDER.indexOf(moved.to) > ORDER.indexOf(moved.from);
}
