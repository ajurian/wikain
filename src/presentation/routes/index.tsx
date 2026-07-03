import { Link, createFileRoute } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { AppShell } from "../components/app-shell";
import { CounterStat } from "../components/counter-stat";
import { GoalRing } from "../components/goal-ring";
import { MasteryChip } from "../components/mastery-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
// MOCK DATA — replace with server functions when wiring.
import { MOCK_LADDER, MOCK_LEARNER, MOCK_QUEUE } from "../mock/learner";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const reduced = useReducedMotion();
  const ladderTotal = MOCK_LADDER.reduce((n, r) => n + r.count, 0);
  const goalMet = MOCK_LEARNER.sentencesToday >= MOCK_LEARNER.dailyGoal;

  return (
    <AppShell>
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
        className="space-y-6"
      >
        {/* headline: honest counter (CNT-2/3/4) + daily goal (CNT-8) */}
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-6">
            <CounterStat
              value={MOCK_LEARNER.usableWords}
              previous={MOCK_LEARNER.usableWordsYesterday}
            />
            <div className="flex flex-col items-center gap-1">
              <GoalRing done={MOCK_LEARNER.sentencesToday} goal={MOCK_LEARNER.dailyGoal} />
              {goalMet ? <p className="text-xs font-medium text-moss">Goal met.</p> : null}
            </div>
          </CardContent>
        </Card>

        {/* session entry (LOOP-1; SEED-6 pacing surfaced) */}
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif text-2xl font-semibold text-ink">Today</h2>
              <p className="text-xs tracking-wide text-ink-faint uppercase">
                {MOCK_QUEUE.dueReviews} due · {MOCK_QUEUE.newIntroductions} new
              </p>
            </div>
            <p className="text-sm leading-relaxed text-ink-soft">
              {MOCK_QUEUE.dueReviews} words are due for review, with{" "}
              {MOCK_QUEUE.newIntroductions} new words woven in. One sentence at a time.
            </p>
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/review">
                Start session <ArrowRight data-slot="icon" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* mastery ladder distribution (SM-1) */}
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="font-serif text-2xl font-semibold text-ink">Your ladder</h2>
            <div className="flex h-3 w-full overflow-hidden rounded-full">
              {MOCK_LADDER.map(({ state, count }) => (
                <div
                  key={state}
                  className={
                    {
                      Seen: "bg-mastery-seen",
                      Recognized: "bg-mastery-recognized",
                      Productive: "bg-mastery-productive",
                      Fluent: "bg-mastery-fluent",
                    }[state]
                  }
                  style={{ width: `${(count / ladderTotal) * 100}%` }}
                  aria-label={`${state}: ${count}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {MOCK_LADDER.map(({ state, count }) => (
                <span key={state} className="flex items-center gap-1.5 text-sm text-ink-soft">
                  <MasteryChip state={state} /> {count}
                </span>
              ))}
            </div>
            <Link
              to="/words"
              className="inline-flex items-center gap-1 text-sm font-medium text-ink underline-offset-4 hover:underline"
            >
              Browse your words <ArrowRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>

        {/* quiet enrichment nudge — no streaks, ever (CNT-9) */}
        <p className="flex items-center gap-2 px-1 text-sm text-ink-faint">
          <Sparkles className="size-4" strokeWidth={1.5} />
          Five honest sentences beat fifty flashcards.
        </p>
      </motion.div>
    </AppShell>
  );
}
