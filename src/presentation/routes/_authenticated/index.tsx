import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { CounterStat } from "../../components/counter-stat";
import { GoalRing } from "../../components/goal-ring";
import { MasteryChip } from "../../components/mastery-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usableCounterFn } from "../../server/counter";
import { dashboardSummaryFn } from "../../server/dashboard";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

function Dashboard() {
  const reduced = useReducedMotion();

  // The honest usable-words counter (CNT-2/3/4). No `previous` — a yesterday delta needs a persisted
  // daily snapshot we don't store, so we show the real count without a fabricated comparison.
  const { data: counter } = useQuery({
    queryKey: ["usable-counter"],
    queryFn: () => usableCounterFn(),
  });

  // The dashboard read-model: SM-1 ladder, Today due/new counts (SEED-6), and the CNT-8 daily-use goal.
  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => dashboardSummaryFn(),
  });

  const ladder = summary?.ladder ?? [];
  const ladderTotal = ladder.reduce((n, r) => n + r.count, 0);
  const sentencesToday = summary?.sentencesToday ?? 0;
  const dailyGoal = summary?.dailyGoal ?? 0;
  const goalMet = dailyGoal > 0 && sentencesToday >= dailyGoal;
  const dueReviews = summary?.dueReviews ?? 0;
  const newIntroductions = summary?.newIntroductions ?? 0;

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
            <CounterStat value={counter?.count ?? 0} />
            <div className="flex flex-col items-center gap-1">
              <GoalRing done={sentencesToday} goal={dailyGoal} />
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
                {dueReviews} due · up to {newIntroductions} new
              </p>
            </div>
            <p className="text-sm leading-relaxed text-ink-soft">
              {dueReviews === 0 && newIntroductions === 0
                ? "You're all caught up. Nothing is due right now."
                : `${dueReviews} ${dueReviews === 1 ? "word is" : "words are"} due for review, with up to ${newIntroductions} new woven in. One sentence at a time.`}
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
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-paper-sunken">
              {ladderTotal > 0
                ? ladder.map(({ state, count }) => (
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
                  ))
                : null}
            </div>
            {ladderTotal > 0 ? (
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {ladder.map(({ state, count }) => (
                  <span key={state} className="flex items-center gap-1.5 text-sm text-ink-soft">
                    <MasteryChip state={state} /> {count}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-soft">
                No words yet — start a session to begin building your ladder.
              </p>
            )}
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
