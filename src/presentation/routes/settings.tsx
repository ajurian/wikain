/*
 * /settings — daily goal (CNT-8: learner-set, unit = sentences), level band,
 * timezone (calendar-day logic SM-5b/CNT-2 depends on it). No notification or
 * streak settings — streaks don't exist (CNT-9). DESIGN BUILD, MOCK-DRIVEN.
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { Minus, Plus } from "lucide-react";

import { AppShell } from "../components/app-shell";
// MOCK DATA — replace with server functions when wiring.
import { MOCK_LEARNER } from "../mock/learner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const reduced = useReducedMotion();
  const [goal, setGoal] = useState(MOCK_LEARNER.dailyGoal);

  return (
    <AppShell>
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-6"
      >
        <h1 className="font-serif text-2xl font-semibold text-ink">Settings</h1>

        {/* daily goal (CNT-8): unit is sentences, adjustable, no coercion */}
        <Card>
          <CardContent className="space-y-3 p-5">
            <div>
              <p className="text-sm font-medium text-ink">Daily goal</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">
                Real sentences per day — flashcards don’t count. Pick something you can hit about
                six days in seven.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                aria-label="Lower goal"
                onClick={() => setGoal((g) => Math.max(1, g - 1))}
              >
                <Minus />
              </Button>
              <span className="min-w-16 text-center font-serif text-3xl font-semibold text-ink tabular-nums">
                {goal}
              </span>
              <Button
                variant="outline"
                size="icon"
                aria-label="Raise goal"
                onClick={() => setGoal((g) => Math.min(20, g + 1))}
              >
                <Plus />
              </Button>
              <span className="text-sm text-ink-soft">sentences / day</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Level</p>
                <p className="mt-0.5 text-xs text-ink-faint">{MOCK_LEARNER.levelBand}</p>
              </div>
              <Button variant="outline" size="sm">
                Retune
              </Button>
            </div>
            <div className="flex items-center justify-between border-t border-line pt-4">
              <div>
                <p className="text-sm font-medium text-ink">Timezone</p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {MOCK_LEARNER.timezone} — “separate days” for your progress follow this clock.
                </p>
              </div>
              <Button variant="outline" size="sm">
                Change
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div>
              <p className="text-sm font-medium text-ink">{MOCK_LEARNER.name}</p>
              <p className="mt-0.5 text-xs text-ink-faint">{MOCK_LEARNER.email}</p>
            </div>
            <Button variant="outline" size="sm">
              Sign out
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </AppShell>
  );
}
