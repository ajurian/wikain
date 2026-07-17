/*
 * /placement — retune where the learner's frontier sits (spec/09 SEED-2 mechanism (i)), reached from the
 * `/settings` "Retune" button. Placement was a one-shot decision until this route existed: `/onboarding`
 * bounces anyone already onboarded, so a learner whose words were consistently too hard or too easy had no
 * way to correct their band.
 *
 * Both mechanism-(i) instruments, kept separate: the coarse self-report (two taps; SEED-4 sanctions it for a
 * self-aware learner) and the published LexTALE test (five minutes; a calibrated scalar). Per-word marking is
 * deliberately NOT offered here — marks are additive-only in v1 (no un-mark), so a mistaken tap outside the
 * onboarding context would be permanent.
 *
 * Nothing here seeds or touches existing cards (SEED-3): the new band changes only which words the list stack
 * selects NEXT. Existing cards keep their FSRS schedule, mastery, and append-only review log (DM-6).
 */
import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";

import { DURATION, EASE } from "@/lib/motion";
import { ArrowRight, CircleCheck, Loader2 } from "lucide-react";

import {
  coarseLevelForBand,
  type CoarseLevel,
} from "~/domain/placement/placement.js";
import {
  readPlacementProfileFn,
  setCoarseLevelFn,
  submitLexTaleFn,
} from "@/server/placement";
import { AppShell } from "@/components/app-shell";
import { CoarseLevelPicker } from "@/components/coarse-level-picker";
import { LexTaleTest } from "@/components/lextale-test";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/_onboarded/placement")({
  component: PlacementPage,
});

/** The hub, the running instrument, or its result. Mirrors onboarding's `TuneStep` view machine. */
type View = "hub" | "lextale" | "result";

function PlacementPage() {
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [view, setView] = useState<View>("hub");
  const [result, setResult] = useState<{
    score: number;
    frontierBand: string;
  } | null>(null);

  const { data: placement, isPending } = useQuery({
    queryKey: ["placement-profile"],
    queryFn: () => readPlacementProfileFn(),
  });

  /** Both writers land on the same key `/settings` reads, so the band there is never stale. */
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["placement-profile"] });

  const coarse = useMutation({
    mutationFn: (level: CoarseLevel) => setCoarseLevelFn({ data: { level } }),
    onSuccess: async () => {
      await invalidate();
      navigate({ to: "/settings" });
    },
  });

  const lextale = useMutation({
    mutationFn: (answers: Record<string, boolean>) =>
      submitLexTaleFn({ data: { answers } }),
    onSuccess: async (res) => {
      setResult(res);
      await invalidate();
      setView("result");
    },
    onError: () => setView("hub"),
  });

  // The 60-item test runs chromeless, like /review — no bottom tabs to tap away mid-decision.
  if (view === "lextale") {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
        <LexTaleTest
          submitting={lextale.isPending}
          onCancel={() => setView("hub")}
          onFinish={(answers) => lextale.mutate(answers)}
        />
      </div>
    );
  }

  return (
    <AppShell>
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.base, ease: EASE }}
        className="space-y-6"
      >
        {view === "result" && result !== null ? (
          <LexTaleResult
            result={result}
            onDone={() => navigate({ to: "/settings" })}
          />
        ) : isPending || placement === undefined ? (
          <Loading />
        ) : (
          <Hub
            frontierBand={placement.frontierBand}
            lextaleScore={placement.lextaleScore}
            savingCoarse={coarse.isPending}
            coarseFailed={coarse.isError}
            lextaleFailed={lextale.isError}
            onSaveCoarse={(level) => coarse.mutate(level)}
            onTakeLexTale={() => setView("lextale")}
          />
        )}
      </motion.div>
    </AppShell>
  );
}

function Loading() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-ink-faint">
      <Loader2 className="size-5 animate-spin" strokeWidth={1.75} />
      <p className="text-sm">Loading your level…</p>
    </div>
  );
}

function LexTaleResult({
  result,
  onDone,
}: {
  result: { score: number; frontierBand: string };
  onDone: () => void;
}) {
  return (
    <div className="space-y-6">
      <CircleCheck className="size-10 text-moss" strokeWidth={1.5} />
      <h1 className="text-xl font-semibold text-ink">
        You scored{" "}
        <span className="tabular-nums">{Math.round(result.score)}%</span> —
        around {result.frontierBand}.
      </h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        New words will come from {result.frontierBand} onward. The words you’re
        already learning keep their schedule and progress — nothing was reset.
      </p>
      <Button size="lg" className="w-full" onClick={onDone}>
        Back to settings <ArrowRight data-slot="icon" />
      </Button>
    </div>
  );
}

function Hub({
  frontierBand,
  lextaleScore,
  savingCoarse,
  coarseFailed,
  lextaleFailed,
  onSaveCoarse,
  onTakeLexTale,
}: {
  frontierBand: string;
  lextaleScore: number | null;
  savingCoarse: boolean;
  coarseFailed: boolean;
  lextaleFailed: boolean;
  onSaveCoarse: (level: CoarseLevel) => void;
  onTakeLexTale: () => void;
}) {
  // Pre-select whatever the current band implies, so the form shows where they are, not an empty slate.
  const [level, setLevel] = useState<CoarseLevel | null>(() =>
    coarseLevelForBand(frontierBand),
  );
  const tookLexTale = lextaleScore !== null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">
          Retune your level
        </h1>
        <p className="mt-1 text-xs text-ink-faint">
          Currently {frontierBand}
          {tookLexTale
            ? ` — LexTALE ${Math.round(lextaleScore)}%`
            : " — from your self-report"}
        </p>
      </div>

      {/* The honest constraint, stated once and up front: this is not a reset button. */}
      <p className="rounded-lg bg-paper-sunken px-3.5 py-3 text-sm leading-relaxed text-ink-soft">
        This only changes{" "}
        <span className="font-medium text-ink">which words come next</span>. The
        words you’re already learning keep their schedule and progress.
      </p>

      {/* SEED-2 (i), the two-tap path. Recommended for a nudge — see the retake note below. */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <p className="text-sm font-medium text-ink">
              How does your English writing feel now?
            </p>
            <p className="mt-0.5 text-xs text-ink-faint">
              A rough answer is fine — the schedule self-corrects within a few
              sessions.
            </p>
          </div>
          <CoarseLevelPicker
            value={level}
            onChange={setLevel}
            disabled={savingCoarse}
          />
          {coarseFailed ? (
            <p className="text-xs text-terracotta">
              Couldn’t save that — please try again.
            </p>
          ) : null}
          <Button
            className="w-full"
            disabled={level === null || savingCoarse}
            onClick={() => level && onSaveCoarse(level)}
          >
            {savingCoarse ? "Saving…" : "Save level"}
          </Button>
        </CardContent>
      </Card>

      {/* SEED-4, the published instrument. Recommended only to someone who has never taken it. */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-ink">
              {tookLexTale
                ? "Retake the placement test"
                : "Take the placement test"}
            </p>
            {tookLexTale ? null : (
              <Badge variant="secondary">Recommended</Badge>
            )}
          </div>
          {tookLexTale ? (
            // SEED-4's norms assume a naive participant; a second run scores high because the learner has
            // seen the 20 nonwords. Say so rather than dress an inflated number up as a measurement.
            <p className="text-xs leading-relaxed text-ink-faint">
              You’ve seen these words before, so a second score usually runs
              high. For a small nudge, the question above is the more honest
              tool.
            </p>
          ) : (
            <p className="text-xs text-ink-faint">
              Five minutes, 60 words. A calibrated starting level beats a guess.
            </p>
          )}
          {lextaleFailed ? (
            <p className="text-xs text-terracotta">
              Couldn’t score that run — try again or skip.
            </p>
          ) : null}
          <Button variant="outline" size="sm" onClick={onTakeLexTale}>
            {tookLexTale ? "Retake the test" : "Take the placement test"}
          </Button>
        </CardContent>
      </Card>

      <Link
        to="/settings"
        className="mx-auto block text-center text-xs text-ink-faint underline-offset-4 hover:underline"
      >
        Back to settings
      </Link>
    </div>
  );
}
