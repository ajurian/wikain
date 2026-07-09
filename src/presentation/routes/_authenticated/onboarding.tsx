/*
 * /onboarding — first-session flow (SEED-1), WIRED to the real backend, and the REQUIRED next step after
 * auth: `_onboarded` bounces every app route here until `completeOnboardingFn` has run, and this route
 * bounces back to `/` once it has. A production win comes BEFORE any long calibration: welcome → coarse
 * level → two REAL seeded words → first written sentence (real rule layer + real judge) → only then the
 * optional "tune your level" placement.
 *
 * Server-driven (STACK-2): the coarse level is POSTed as a level (not a band), and the server maps it to a
 * frontier band (`frontierBandForCoarseLevel`, SEED-2/5), PERSISTS it, and seeds at it (SEED-1/6). The first
 * win runs the two-phase judged path — `ruleCheckFn` for the instant bounce (NET-2), then
 * `judgeFirstProductionFn`, which judges but PERSISTS NOTHING (the seeded words are still `Seen`; a graded
 * free review would leak into the counter, INV-4).
 *
 * The tune step offers the two remaining SEED-2 mechanisms, kept structurally separate: per-word marking
 * (→ `placement_marks`, the only thing that skips `Seen`, SM-11) and the published LexTALE instrument
 * (→ one scalar that moves the frontier band and nothing else, SEED-3/4).
 */
import { useState } from "react";
import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import {
  useMutation,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, CircleCheck, CloudOff, Loader2 } from "lucide-react";

import {
  frontierBandForCoarseLevel,
  type CoarseLevel,
} from "../../../domain/placement/placement.js";
import type { RuleBounceReason } from "../../../domain/review/ruleLayer.js";
import type { SeededWordView } from "../../../application/presentSeededWords.js";
import {
  seedFirstSessionFn,
  judgeFirstProductionFn,
  completeOnboardingFn,
} from "../../server/onboarding";
import {
  placementSlateFn,
  recordPlacementMarksFn,
  submitLexTaleFn,
} from "../../server/placement";
import { ruleCheckFn } from "../../server/review";
import { signOut } from "../../lib/auth-client";
import { BounceCallout } from "../../components/bounce-callout";
import { CheckingIndicator } from "../../components/checking-indicator";
import { CoarseLevelPicker } from "../../components/coarse-level-picker";
import { LexTaleTest } from "../../components/lextale-test";
import { Wordmark } from "../../components/wordmark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/onboarding")({
  // The inverse of `_onboarded` (SEED-1): a placed learner has no business re-running seeding. Sits here
  // rather than in `_onboarded` precisely so the two redirects can't form a loop.
  beforeLoad: ({ context }) => {
    if (context.session.onboarded) throw redirect({ to: "/" });
  },
  component: Onboarding,
});

type Step = "welcome" | "level" | "seeds" | "firstWin" | "tune";
const STEPS: Step[] = ["welcome", "level", "seeds", "firstWin", "tune"];

function Onboarding() {
  const [step, setStep] = useState<Step>("welcome");
  const [level, setLevel] = useState<CoarseLevel | null>(null);
  const reduced = useReducedMotion();

  /**
   * The band the tune step reads. Seeded from the coarse level (the server persisted the same mapping) and
   * OVERWRITTEN by a LexTALE result, so the placement slate re-keys and refetches at the retuned band.
   */
  const [frontierBand, setFrontierBand] = useState<string | null>(null);

  // SEED-1/6: seed the first-session words once the coarse level is chosen (POST via useQuery, run once —
  // the same pattern the /review session uses). The result feeds both the seeds and first-win screens.
  const seeds = useQuery({
    queryKey: ["onboarding-seeds", level],
    queryFn: () => seedFirstSessionFn({ data: { level: level! } }),
    enabled: level !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-6 pb-8">
      {/* step dots */}
      <div className="mb-10 flex items-center justify-between">
        <Wordmark className="text-xl" />
        <div className="flex gap-1.5">
          {STEPS.map((s) => (
            <span
              key={s}
              className={cn(
                "size-1.5 rounded-full",
                STEPS.indexOf(s) <= STEPS.indexOf(step)
                  ? "bg-amber"
                  : "bg-paper-sunken",
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {step === "welcome" ? (
              <Welcome onNext={() => setStep("level")} />
            ) : null}
            {step === "level" ? (
              <LevelStep
                onNext={(lvl) => {
                  setLevel(lvl);
                  setFrontierBand(frontierBandForCoarseLevel(lvl));
                  setStep("seeds");
                }}
              />
            ) : null}
            {step === "seeds" ? (
              <SeedsStep seeds={seeds} onNext={() => setStep("firstWin")} />
            ) : null}
            {step === "firstWin" ? (
              <FirstWinStep
                word={seeds.data?.[0]}
                onNext={() => setStep("tune")}
              />
            ) : null}
            {step === "tune" && frontierBand !== null ? (
              <TuneStep
                frontierBand={frontierBand}
                onRetune={setFrontierBand}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-ink-faint">
      <Loader2 className="size-5 animate-spin" strokeWidth={1.75} />
      <p className="text-sm">{label}</p>
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  const navigate = useNavigate();
  const router = useRouter();

  // The learner is already authenticated here (this route is inside `_authenticated`), so there is no
  // "already have an account?" link — only an escape hatch for a wrong account on a shared device.
  async function onSignOut() {
    await signOut();
    await router.invalidate();
    navigate({ to: "/signin" });
  }

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl leading-snug font-semibold text-ink">
        Grow the English you can actually{" "}
        <em className="text-amber-deep">use</em> — one written sentence at a
        time.
      </h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        Wikain trains active vocabulary: you don’t just recognize words, you
        write with them. Your sentence is the lesson.
      </p>
      <Button size="lg" className="w-full" onClick={onNext}>
        Get started <ArrowRight data-slot="icon" />
      </Button>
      <p className="text-center text-sm text-ink-faint">
        Not you?{" "}
        <button
          type="button"
          onClick={onSignOut}
          className="font-medium text-ink underline-offset-4 hover:underline"
        >
          Sign out
        </button>
      </p>
    </div>
  );
}

/** One coarse self-report question — the low-friction signal that sets the frontier band (SEED-1/2/5). */
function LevelStep({ onNext }: { onNext: (level: CoarseLevel) => void }) {
  const [band, setBand] = useState<CoarseLevel | null>(null);
  return (
    <div className="space-y-6">
      <h2 className="font-serif text-2xl font-semibold text-ink">
        How does your English writing feel at work?
      </h2>
      <CoarseLevelPicker value={band} onChange={setBand} />
      <Button
        size="lg"
        className="w-full"
        disabled={!band}
        onClick={() => band && onNext(band)}
      >
        Continue
      </Button>
      <p className="text-center text-xs text-ink-faint">
        A rough guess is fine — you can take the placement test in a minute, and
        the schedule self-corrects within a few sessions.
      </p>
    </div>
  );
}

function SeedsStep({
  seeds,
  onNext,
}: {
  seeds: UseQueryResult<SeededWordView[]>;
  onNext: () => void;
}) {
  if (seeds.isPending) return <Loading label="Picking your first words…" />;
  if (seeds.isError || seeds.data === undefined) {
    return (
      <p className="py-8 text-center text-sm text-terracotta">
        Couldn’t pick your first words. Please refresh to try again.
      </p>
    );
  }
  if (seeds.data.length === 0) {
    return (
      <div className="space-y-4 py-8 text-center">
        <p className="text-sm text-ink-soft">
          We couldn’t find new words at your level right now — you can still
          finish setting up.
        </p>
        <Button size="lg" className="w-full" onClick={onNext}>
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="font-serif text-2xl font-semibold text-ink">
        Two words to start.
      </h2>
      <p className="text-sm leading-relaxed text-ink-soft">
        You’ll write your first sentence in about a minute.
      </p>
      <div className="space-y-3">
        {seeds.data.map((item) => (
          <div
            key={item.senseId}
            className="rounded-xl border border-line bg-paper-raised p-5"
          >
            <p className="font-serif text-2xl font-semibold text-ink">
              {item.lemma}
            </p>
            <p className="mt-0.5 text-xs tracking-wide text-ink-faint uppercase">
              {item.pos}
              {item.cefr ? ` · ${item.cefr}` : ""}
            </p>
            {item.recognitionMeaning ? (
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {item.recognitionMeaning}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <Button size="lg" className="w-full" onClick={onNext}>
        Write your first sentence <ArrowRight data-slot="icon" />
      </Button>
    </div>
  );
}

/** The first win (SEED-1) — a REAL judged production (no persistence), before any placement test. */
function FirstWinStep({
  word,
  onNext,
}: {
  word: SeededWordView | undefined;
  onNext: () => void;
}) {
  const [text, setText] = useState("");
  const [bounce, setBounce] = useState<RuleBounceReason | null>(null);
  const [bounceCount, setBounceCount] = useState(0);
  const [checking, setChecking] = useState(false);
  const [won, setWon] = useState(false);
  const [notice, setNotice] = useState<"offline" | "unavailable" | null>(null);

  // No seeded word (an exhausted frontier): the win is unreachable, so don't strand the learner here.
  if (word === undefined) {
    return (
      <div className="space-y-4 py-8 text-center">
        <p className="text-sm text-ink-soft">
          No word to practice yet — let’s finish setting up.
        </p>
        <Button size="lg" className="w-full" onClick={onNext}>
          Continue
        </Button>
      </div>
    );
  }

  const submit = async () => {
    setBounce(null);
    setNotice(null);

    // NET-5: block the round-trip entirely when offline — never call the judge.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setNotice("offline");
      return;
    }

    // Phase 1 — the instant, judge-free rule check (NET-2: no "checking…" before a bounce).
    const check = await ruleCheckFn({
      data: {
        senseId: word.senseId,
        response: text,
        priorBounces: bounceCount,
      },
    });
    if (!check.ok) {
      setBounceCount(check.bounces);
      setBounce(check.reason);
      return;
    }

    // Phase 2 — the judge round-trip (show "checking…" while it runs).
    setChecking(true);
    const result = await judgeFirstProductionFn({
      data: { senseId: word.senseId, response: text },
    });
    setChecking(false);
    // Onboarding win: ANY judged outcome (pass or fail) reaches the win screen (SEED-1).
    if (result.kind === "judged") setWon(true);
    else if (result.kind === "bounce") {
      setBounceCount(result.bounces);
      setBounce(result.reason);
    } else setNotice("unavailable");
  };

  if (won) {
    return (
      <div className="space-y-6">
        <CircleCheck className="size-10 text-moss" strokeWidth={1.5} />
        <h2 className="font-serif text-3xl font-semibold text-ink">
          That sentence is yours now.
        </h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          “<span className="font-serif">{text}</span>”
        </p>
        <p className="text-sm leading-relaxed text-ink-soft">
          Every review works like this: real sentences, honestly checked. Want
          to tune your level, or keep going?
        </p>
        <Button size="lg" className="w-full" onClick={onNext}>
          Continue <ArrowRight data-slot="icon" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">
        your first sentence
      </p>
      <div>
        <h2 className="font-serif text-4xl font-semibold text-ink">
          {word.lemma}
        </h2>
        <p className="mt-1 text-xs tracking-wide text-ink-faint uppercase">
          {word.pos}
          {word.cefr ? ` · ${word.cefr}` : ""}
        </p>
      </div>
      <p className="text-sm leading-relaxed text-ink-soft">
        Write a sentence using{" "}
        <span className="font-serif italic">{word.lemma}</span> — ideally
        something true about you.
        {word.selfReferencePrompt ? ` ${word.selfReferencePrompt}` : ""}
      </p>
      <div className="space-y-3">
        <Textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={checking}
          placeholder="Your sentence…"
          className="min-h-24 font-serif text-xl leading-relaxed"
        />
        {bounce ? <BounceCallout kind={bounce} lemma={word.lemma} /> : null}
        {notice === "offline" ? (
          <p className="flex items-center gap-2 rounded-lg bg-paper-sunken px-3.5 py-3 text-sm text-ink-soft">
            <CloudOff
              className="size-4 shrink-0 text-ink-faint"
              strokeWidth={1.5}
            />
            You’re offline — reconnect to check this sentence.
          </p>
        ) : null}
        {notice === "unavailable" ? (
          <p className="rounded-lg bg-paper-sunken px-3.5 py-3 text-sm text-ink-soft">
            Couldn’t check that one — try again. Your sentence is still here.
          </p>
        ) : null}
        {checking ? (
          <CheckingIndicator />
        ) : (
          <Button
            size="lg"
            className="w-full"
            onClick={submit}
            disabled={text.trim().length === 0}
          >
            Check my sentence
          </Button>
        )}
      </div>
    </div>
  );
}

/** What the tune step is showing: its own hub, the running instrument, or the instrument's result. */
type TuneView = "hub" | "lextale" | "lextaleResult";

/**
 * Optional placement AFTER the win (SEED-2/3/4): the two remaining mechanisms, both skippable, kept
 * structurally separate.
 *  - Per-word marking (SEED-2/7): REAL frontier candidates from `placementSlateFn`, marked BY senseId; on
 *    finish `recordPlacementMarksFn` persists them so the seeder enters a flagged word at `Recognized`
 *    (SM-11) when the pacer next reaches it.
 *  - LexTALE (SEED-4): the published instrument. Its scalar moves the frontier band and NOTHING else
 *    (SEED-3) — it never marks a word known, which is why it re-keys the slate rather than filling it in.
 *
 * Finishing (either way, including skipping both) is what completes onboarding — the gate the `_onboarded`
 * layout reads.
 */
function TuneStep({
  frontierBand,
  onRetune,
}: {
  frontierBand: string;
  onRetune: (band: string) => void;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const [view, setView] = useState<TuneView>("hub");
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{
    score: number;
    frontierBand: string;
  } | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);

  // Real frontier candidates to tap (SEED-2), excluding words already carded (SEED-7) — server-resolved at
  // the learner's PERSISTED band, so a LexTALE retune re-keys this query and refetches the right slate.
  const slate = useQuery({
    queryKey: ["placement-slate", frontierBand],
    queryFn: () => placementSlateFn(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const lextale = useMutation({
    mutationFn: (answers: Record<string, boolean>) =>
      submitLexTaleFn({ data: { answers } }),
    onSuccess: (res) => {
      setResult(res);
      onRetune(res.frontierBand); // SEED-2 (i): the scalar moves the frontier, nothing else
      setView("lextaleResult");
    },
    onError: () => setView("hub"),
  });

  /**
   * Finish: persist the marks (best-effort — additive, so a failed write just means those words card at
   * `Seen`), then stamp completion. Completion MUST succeed: without it `_onboarded` sends the learner
   * straight back here, so unlike the marks it surfaces an error and lets them retry rather than navigating.
   */
  const finish = useMutation({
    mutationFn: async () => {
      if (known.size > 0) {
        try {
          await recordPlacementMarksFn({ data: { senseIds: [...known] } });
        } catch {
          // Non-fatal by design: a mark is an optimization, not a prerequisite for finishing.
        }
      }
      await completeOnboardingFn();
    },
    onSuccess: async () => {
      await router.invalidate(); // so `_onboarded` sees onboarded: true before we navigate into it
      navigate({ to: "/" });
    },
    onError: () =>
      setFinishError("Couldn’t finish setting up — please try again."),
  });

  const toggle = (senseId: string) =>
    setKnown((prev) => {
      const next = new Set(prev);
      if (next.has(senseId)) next.delete(senseId);
      else next.add(senseId);
      return next;
    });

  if (view === "lextale") {
    return (
      <LexTaleTest
        submitting={lextale.isPending}
        onCancel={() => setView("hub")}
        onFinish={(answers) => lextale.mutate(answers)}
      />
    );
  }

  if (view === "lextaleResult" && result !== null) {
    return (
      <div className="space-y-6">
        <CircleCheck className="size-10 text-moss" strokeWidth={1.5} />
        <h2 className="font-serif text-2xl font-semibold text-ink">
          You scored{" "}
          <span className="tabular-nums">{Math.round(result.score)}%</span> —
          around {result.frontierBand}.
        </h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          We’ll start you on {result.frontierBand} words. This only sets where
          your words come from — nothing is marked “known” on your behalf, and
          the schedule keeps adjusting as you write.
        </p>
        <Button size="lg" className="w-full" onClick={() => setView("hub")}>
          Continue <ArrowRight data-slot="icon" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="font-serif text-2xl font-semibold text-ink">
        Tune your level — optional.
      </h2>

      {/* SEED-4: the objective instrument. Recommended over self-report (see docs/RESEARCH.md §E). */}
      <div className="rounded-xl border border-line bg-paper-raised p-5">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-ink">
            Take the placement test
          </p>
          <Badge variant="secondary">Recommended</Badge>
        </div>
        <p className="mt-0.5 text-xs text-ink-faint">
          Five minutes, 60 words. A calibrated starting level beats a guess.
        </p>
        {lextale.isError ? (
          <p className="mt-2 text-xs text-terracotta">
            Couldn’t score that run — you can try again or skip.
          </p>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setView("lextale")}
        >
          {result === null ? "Take the placement test" : "Retake the test"}
        </Button>
      </div>

      <div className="rounded-xl border border-line bg-paper-raised p-5">
        <p className="text-sm font-medium text-ink">
          Tap the words you already know.
        </p>
        <p className="mt-0.5 text-xs text-ink-faint">
          Known words skip the flashcard stage and go straight to production
          practice.
        </p>
        {slate.isPending ? (
          <div className="mt-3">
            <Loading label="Loading words…" />
          </div>
        ) : slate.isError || slate.data === undefined ? (
          <p className="mt-3 text-sm text-terracotta">
            Couldn’t load words — you can skip this step.
          </p>
        ) : slate.data.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">
            No words to mark right now — skip ahead.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {slate.data.map((w) => (
              <button
                key={w.senseId}
                type="button"
                onClick={() => toggle(w.senseId)}
                className={cn(
                  "rounded-full border px-3 py-1.5 font-serif text-base transition-colors duration-150",
                  known.has(w.senseId)
                    ? "border-amber-deep bg-amber-wash text-ink"
                    : "border-line bg-paper text-ink-soft hover:border-ink-faint",
                )}
              >
                {w.lemma}
              </button>
            ))}
          </div>
        )}
      </div>

      {finishError ? (
        <p className="text-sm text-terracotta">{finishError}</p>
      ) : null}
      <Button
        size="lg"
        className="w-full"
        disabled={finish.isPending}
        onClick={() => {
          setFinishError(null);
          finish.mutate();
        }}
      >
        {known.size > 0
          ? `Save ${known.size} known words and finish`
          : "Finish setting up"}
      </Button>
    </div>
  );
}
