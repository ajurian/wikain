/*
 * /settings — wired (STACK-4 + CNT-8). The daily goal is the learner-adjustable sentences/day target,
 * persisted through `updateSettingsFn` and read back by the dashboard goal ring. Identity (name/email)
 * + sign-out come from the real session. No notification or streak settings — streaks don't exist (CNT-9).
 */
import { useMemo, useState } from "react";
import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";

import { DURATION, EASE } from "@/lib/motion";
import { Minus, Plus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { signOut, useSession } from "@/lib/auth-client";
import { readSettingsFn, updateSettingsFn } from "@/server/settings";
import { readPlacementProfileFn } from "@/server/placement";
import { DAILY_GOAL_MAX, DAILY_GOAL_MIN } from "~/domain/constants.js";
import type { UserSettings } from "~/domain/settings.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

/** Fallback zone list for runtimes without `Intl.supportedValuesOf` (older engines). */
const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Manila",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
];

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

  // The day-boundary clock (SM-5b/CNT-2). Offer every IANA zone the runtime knows, with UTC, the
  // device's own zone, and the persisted one always present so the current value is always selectable.
  const currentTz = settings?.timezone ?? "UTC";
  const deviceTz =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const zones = useMemo(() => {
    const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf;
    const all =
      typeof supportedValuesOf === "function" ? supportedValuesOf("timeZone") : COMMON_TIMEZONES;
    return Array.from(new Set(["UTC", deviceTz, currentTz, ...all].filter(Boolean)));
  }, [deviceTz, currentTz]);

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
        transition={{ duration: DURATION.base, ease: EASE }}
        className="space-y-6"
      >
        <h1 className="text-xl font-semibold text-ink">Settings</h1>

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
              <span className="min-w-16 text-center font-mono text-3xl font-medium text-ink tabular-nums">
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
            <div className="space-y-2 border-t border-line pt-4">
              <div>
                <p className="text-sm font-medium text-ink">Timezone</p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  “Separate days” for your counter and daily goal follow this clock.
                </p>
              </div>
              {/*
               * A Combobox, not a Select: the runtime knows ~400 IANA zones, well past the point
               * where scanning a list works — the filter input is the point. A native <select> also
               * renders its panel in OS chrome, which ignores every paper/ink token.
               */}
              <Combobox
                items={zones}
                value={currentTz}
                onValueChange={(timezone) => {
                  if (timezone && timezone !== currentTz) mutation.mutate({ timezone });
                }}
                disabled={mutation.isPending}
              >
                <ComboboxInput placeholder="Search time zones…" aria-label="Timezone" />
                <ComboboxContent>
                  <ComboboxEmpty>No matching time zone.</ComboboxEmpty>
                  <ComboboxList>
                    {(zone: string) => (
                      <ComboboxItem key={zone} value={zone}>
                        {zone}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              {deviceTz && deviceTz !== currentTz && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => mutation.mutate({ timezone: deviceTz })}
                >
                  Use this device’s time ({deviceTz})
                </Button>
              )}
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
