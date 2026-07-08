/*
 * /settings — wired (STACK-4 + CNT-8). The daily goal is the learner-adjustable sentences/day target,
 * persisted through `updateSettingsFn` and read back by the dashboard goal ring. Identity (name/email)
 * + sign-out come from the real session. No notification or streak settings — streaks don't exist (CNT-9).
 */
import { useState } from "react";
import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { Minus, Plus } from "lucide-react";

import { AppShell } from "../../../components/app-shell";
import { signOut, useSession } from "../../../lib/auth-client";
import { readSettingsFn, updateSettingsFn } from "../../../server/settings";
import { readPlacementProfileFn } from "../../../server/placement";
import { DAILY_GOAL_MAX, DAILY_GOAL_MIN } from "../../../../domain/constants.js";
import type { UserSettings } from "../../../../domain/settings.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/_onboarded/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: session } = useSession();

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => readSettingsFn(),
  });

  // The level band is placement state, not a preference (spec/09 SEED-2) — it lives in its own store.
  const { data: placement } = useQuery({
    queryKey: ["placement-profile"],
    queryFn: () => readPlacementProfileFn(),
  });

  // Optimistic local override so the stepper feels instant; the persisted value backs it once settled.
  const [pendingGoal, setPendingGoal] = useState<number | null>(null);
  const goal = pendingGoal ?? settings?.dailyGoal ?? DAILY_GOAL_MIN;

  const mutation = useMutation({
    mutationFn: (patch: Partial<UserSettings>) => updateSettingsFn({ data: patch }),
    onSuccess: () => {
      // The dashboard goal ring reads `dailyGoal` off the dashboard summary — refresh both.
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });

  function changeGoal(next: number) {
    const clamped = Math.max(DAILY_GOAL_MIN, Math.min(DAILY_GOAL_MAX, next));
    setPendingGoal(clamped);
    mutation.mutate({ dailyGoal: clamped });
  }

  async function onSignOut() {
    await signOut();
    await router.invalidate();
    navigate({ to: "/signin" });
  }

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
                disabled={goal <= DAILY_GOAL_MIN}
                onClick={() => changeGoal(goal - 1)}
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
                disabled={goal >= DAILY_GOAL_MAX}
                onClick={() => changeGoal(goal + 1)}
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
                <p className="mt-0.5 text-xs text-ink-faint">
                  {placement === undefined
                    ? "—"
                    : placement.lextaleScore === null
                      ? `${placement.frontierBand} — from your self-report`
                      : `${placement.frontierBand} — LexTALE ${Math.round(placement.lextaleScore)}%`}
                </p>
              </div>
              {/* Re-runnable placement (spec/09 SEED-2 (i)) — the coarse self-report or LexTALE. */}
              <Button asChild variant="outline" size="sm">
                <Link to="/placement">Retune</Link>
              </Button>
            </div>
            <div className="flex items-center justify-between border-t border-line pt-4">
              <div>
                <p className="text-sm font-medium text-ink">Timezone</p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {settings?.timezone ?? "UTC"} — “separate days” for your progress follow this clock.
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
              <p className="text-sm font-medium text-ink">{session?.user.name ?? "—"}</p>
              <p className="mt-0.5 text-xs text-ink-faint">{session?.user.email ?? ""}</p>
            </div>
            <Button variant="outline" size="sm" onClick={onSignOut}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </AppShell>
  );
}
