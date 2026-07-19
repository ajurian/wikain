/*
 * /review — the session screen (chromeless focus mode), WIRED to the real backend.
 *
 * Server-driven (STACK-2): `getReviewSessionFn` resolves the mini-session through the BAT-11/12/13
 * two-branch check (resume ≤ T / "Welcome back" rebuild after) and returns the ACTIVE BATCH the
 * client walks (spec/14); `resolvePromptFn` resolves each word's tier + render fields (the correct
 * answer is withheld for MCQ/cloze/cued — grading is server-side), and grading runs through
 * `runReviewPass` behind `submitReviewFn` (deterministic) / `ruleCheckFn` + `submitReviewFn`
 * (judged). The judged tier is two-phase so the "checking…" indicator never precedes a bounce
 * (NET-2): the instant rule-check decides bounces with no judge round-trip, then a rule-pass shows
 * the indicator while the judge runs.
 *
 * Batch progress is SERVER truth (BAT-7): the bar ticks only when a submit's response says a rating
 * was logged; bounces and soft bounces keep the card and the bar exactly where they were. Terminal
 * skips (`skipCardFn`, BAT-8) shrink the denominator instead. At N/N the `BatchSeam` renders the
 * completion beat + the explicit Continue/Done choice (BAT-9).
 *
 * All four tiers are typeset as one dictionary entry — `EntryHeader` (headword slot + italic pos +
 * the hairline rule) over `EntryDefinition` — so the same word read four ways looks like the same
 * artifact. Answering is never submitting: every tier selects or types, then confirms with
 * `CheckButton`.
 */
import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { usePrefetchQuery, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { DURATION, EASE } from "@/lib/motion";
import {
  ArrowRight,
  CircleCheck,
  CircleX,
  CloudOff,
  Lightbulb,
  Loader2,
  X,
} from "lucide-react";

import {
  getReviewSessionFn,
  resolvePromptFn,
  ruleCheckFn,
  seamChoiceFn,
  skipCardFn,
  submitReviewFn,
  type SessionView,
} from "@/server/review";
import type { ReviewPrompt } from "~/application/review/resolveReviewPrompt.js";
import type { ReviewOutcomeView } from "~/application/review/presentReviewOutcome.js";
import type { BatchProgress } from "~/application/session/advanceActiveBatch.js";
import type { MasteryState } from "~/domain/mastery/card.js";
import type { ClozeSoftBounceLane } from "~/domain/review/clozeFitSet.js";

import { BatchSeam } from "@/components/review/batch-seam";
import { BounceCallout } from "@/components/review/bounce-callout";
import { SoftBounceCallout } from "@/components/review/soft-bounce-callout";
import { TarsierIdle } from "@/components/review/tarsier-idle";
import { BlankAnswer, BlankInput } from "@/components/review/blank-input";
import { CheckingIndicator } from "@/components/review/checking-indicator";
import { ClozeSentence } from "@/components/review/cloze-sentence";
import {
  EntryDefinition,
  EntryHeader,
  HeadwordBlank,
} from "@/components/review/entry-header";
import {
  SessionSummary,
  type StepOutcome,
} from "@/components/review/session-summary";
import { VerdictPanel } from "@/components/review/verdict-panel";
import { MasteryChip } from "@/components/mastery-chip";
import { WordOptionList } from "@/components/review/word-option-list";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_onboarded/review")({
  component: ReviewSession,
});

function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * A stable random shuffle computed once per mount (real MCQ shuffle-on-render, TIER-2).
 * `StepCard` is keyed per batch card, so every question remounts and re-shuffles.
 *
 * A lazy `useState` initializer, not `useMemo(…, [])`: the memo would have to claim it depends on
 * nothing while actually reading `items`. State says what is true — seed once from the first items.
 */
function useShuffled<T>(items: readonly T[]): T[] {
  const [shuffled] = useState(() => shuffle(items));
  return shuffled;
}

/* ------------------------------------------------------------------ shell */

/** The client's mirror of the active batch (server truth arrives via SessionView + BatchProgress). */
interface BatchView {
  batchId: string;
  batchNumber: number;
  framing: "fresh" | "resumed" | "welcomeBack";
  queue: string[];
  completed: number;
  total: number;
}

type Stage =
  | { kind: "loading" }
  | { kind: "batch"; batch: BatchView }
  /** `total` keeps the chrome bar honest at N/N while the seam is shown. */
  | { kind: "seam"; total: number }
  | { kind: "empty" }
  /** Terminal client-side: Done was chosen (or the queue ran out) — stay on the summary. */
  | { kind: "done" };

function stageFromView(view: SessionView): Stage {
  switch (view.kind) {
    case "batch":
      return {
        kind: "batch",
        batch: {
          batchId: view.batchId,
          batchNumber: view.batchNumber,
          framing: view.framing,
          queue: view.senseIds,
          completed: view.completed,
          total: view.total,
        },
      };
    case "seam":
      return { kind: "seam", total: view.total };
    case "empty":
      return { kind: "empty" };
    case "done":
      return { kind: "done" };
  }
}

function ReviewSession() {
  const session = useQuery({
    queryKey: ["review-session"],
    queryFn: () => getReviewSessionFn(),
    // BAT-11: a long-idle tab re-runs the SAME two-branch check on return — resume within T, or a
    // rebuilt "Welcome back" batch past it. No third code path.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [batchResults, setBatchResults] = useState<StepOutcome[]>([]);
  const [allResults, setAllResults] = useState<StepOutcome[]>([]);
  const [seamBusy, setSeamBusy] = useState(false);

  // Server truth → client stage, synced during render (the "adjust state when props change"
  // pattern — no effect, no cascading re-render). `done` is terminal here: after Done the server
  // holds no session, so a later refetch would happily build a new batch — the summary must not be
  // yanked away. A refetch that lands a NEW batch (fresh or welcome-back) starts its own summary.
  const [synced, setSynced] = useState<SessionView | null>(null);
  if (session.data !== undefined && session.data !== synced) {
    setSynced(session.data);
    if (stage.kind !== "done") {
      if (
        session.data.kind === "batch" &&
        (stage.kind !== "batch" || stage.batch.batchId !== session.data.batchId)
      ) {
        setBatchResults([]);
      }
      setStage(stageFromView(session.data));
    }
  }

  const adoptProgress = (progress: BatchProgress | null) => {
    setStage((prev) => {
      if (prev.kind !== "batch") return prev;
      const completed = progress?.completed ?? prev.batch.completed + 1;
      const total = progress?.total ?? prev.batch.total;
      if (completed >= total) return { kind: "seam", total };
      return { kind: "batch", batch: { ...prev.batch, completed, total } };
    });
  };

  /** A rated card was acknowledged (Next): record it and advance to the server-reported progress. */
  const handleDone = (outcome: StepOutcome, progress: BatchProgress | null) => {
    setBatchResults((r) => [...r, outcome]);
    setAllResults((r) => [...r, outcome]);
    adoptProgress(progress);
  };

  /** BAT-8: a terminal no-rating skip — shrink the batch server-side, then mirror it locally. */
  const handleSkip = async (outcome: StepOutcome) => {
    if (stage.kind !== "batch") return;
    const senseId = stage.batch.queue[stage.batch.completed];
    const progress = senseId === undefined ? null : await skipCardFn({ data: senseId });
    setBatchResults((r) => [...r, outcome]);
    setAllResults((r) => [...r, outcome]);
    setStage((prev) => {
      if (prev.kind !== "batch") return prev;
      const queue = prev.batch.queue.filter((s) => s !== senseId);
      const completed = progress?.completed ?? prev.batch.completed;
      const total = progress?.total ?? queue.length;
      if (completed >= total) return { kind: "seam", total };
      return { kind: "batch", batch: { ...prev.batch, queue, completed, total } };
    });
  };

  /** BAT-9: the explicit seam choice. Continue → next batch; Done (or exhaustion) → summary. */
  const chooseAtSeam = async (choice: "continue" | "done") => {
    setSeamBusy(true);
    try {
      const view = await seamChoiceFn({ data: { choice } });
      if (view.kind === "batch") {
        setBatchResults([]);
        setStage(stageFromView(view));
      } else {
        setStage({ kind: "done" });
      }
    } finally {
      setSeamBusy(false);
    }
  };

  const batch = stage.kind === "batch" ? stage.batch : null;
  const senseId = batch?.queue[batch.completed];
  const total = stage.kind === "seam" ? stage.total : (batch?.total ?? 0);
  const completed = stage.kind === "seam" ? total : (batch?.completed ?? 0);

  /** Prefetch the next prompt to improve performance */
  usePrefetchQuery({
    queryKey: ["review-prompt", batch?.queue[batch.completed + 1]],
    queryFn: () => resolvePromptFn({ data: batch?.queue[batch.completed + 1] }),
    staleTime: Infinity,
  });

  return (
    <div className="relative mx-auto w-full max-w-xl px-4">
      {/*
       * The chrome is taken OUT of flow so the card centers against the viewport rather than against
       * the space left under the progress bar — in flow, the bar's height pushed the card ~50px low.
       */}
      <div className="absolute inset-x-4 top-4 flex items-center gap-4">
        <Link
          to="/"
          aria-label="End session"
          className="rounded-md p-1 text-ink-faint hover:text-ink"
        >
          <X className="size-5" strokeWidth={1.75} />
        </Link>
        {/* BAT-6: max is the ACTIVE batch's true size — a remainder batch gets a short, honest bar. */}
        <Progress
          aria-label="Batch progress"
          value={Math.min(completed, total)}
          max={Math.max(total, 1)}
          className="h-1.5"
        />
        <span className="font-mono text-xs text-ink-faint tabular-nums">
          {total === 0
            ? "0/0"
            : stage.kind === "seam"
              ? `${total}/${total}`
              : `${Math.min(completed + 1, total)}/${total}`}
        </span>
      </div>

      {/* `py-20` clears the absolute chrome and stays symmetric — equal top/bottom padding is what
          keeps the card centered once a tall card overflows and the page scrolls. */}
      <div className="flex min-h-dvh flex-col justify-center py-20">
        {session.isPending && stage.kind === "loading" ? (
          <CenteredSpinner label="Preparing your session…" />
        ) : session.isError && stage.kind === "loading" ? (
          <p className="text-center text-sm text-terracotta">
            Couldn’t start your session. Please try again.
          </p>
        ) : (
          <>
            {/* BAT-13: the welcome-back framing — a fresh 0/M, never a bar rendered backwards. */}
            {batch !== null &&
            batch.framing === "welcomeBack" &&
            batch.completed === 0 &&
            batchResults.length === 0 ? (
              <p className="mb-6 text-center text-sm text-ink-soft">
                Welcome back — here’s your next set.
              </p>
            ) : null}
            <AnimatePresence mode="wait">
              {stage.kind === "seam" ? (
                <BatchSeam
                  key="seam"
                  results={batchResults}
                  total={stage.total}
                  busy={seamBusy}
                  onChoose={chooseAtSeam}
                />
              ) : stage.kind === "done" ? (
                <SessionSummary key="summary" results={allResults} />
              ) : stage.kind === "empty" ? (
                allResults.length > 0 ? (
                  <SessionSummary key="summary" results={allResults} />
                ) : (
                  <NothingDue key="nothing-due" />
                )
              ) : batch !== null && senseId !== undefined ? (
                <StepCard
                  key={`${batch.batchId}-${senseId}`}
                  senseId={senseId}
                  onDone={handleDone}
                  onSkip={handleSkip}
                />
              ) : null}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-ink-faint">
      <Loader2 className="size-5 animate-spin" strokeWidth={1.75} />
      <p className="text-sm">{label}</p>
    </div>
  );
}

function NothingDue() {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.base, ease: EASE }}
      className="w-full space-y-6 text-center"
    >
      <TarsierIdle variant="flat" className="mx-auto w-44" />
      <div>
        <h1 className="text-xl font-semibold text-ink">Nothing due right now.</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Your words are resting — come back when the next review is due.
        </p>
      </div>
      <Button asChild size="lg">
        <Link to="/">Back home</Link>
      </Button>
    </motion.div>
  );
}

/** Fetches the prompt for one queued word and routes to the matching tier card. */
function StepCard({
  senseId,
  onDone,
  onSkip,
}: {
  senseId: string;
  onDone: (o: StepOutcome, progress: BatchProgress | null) => void;
  onSkip: (o: StepOutcome) => void;
}) {
  const reduced = useReducedMotion();
  const prompt = useQuery({
    queryKey: ["review-prompt", senseId],
    queryFn: () => resolvePromptFn({ data: senseId }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DURATION.base, ease: EASE }}
      className="w-full"
    >
      {prompt.isPending ? (
        <CenteredSpinner label="Loading…" />
      ) : prompt.isError || prompt.data === undefined ? (
        <p className="text-center text-sm text-terracotta">
          Couldn’t load this one.
        </p>
      ) : (
        <PromptCard prompt={prompt.data} onDone={onDone} onSkip={onSkip} />
      )}
    </motion.div>
  );
}

function PromptCard({
  prompt,
  onDone,
  onSkip,
}: {
  prompt: ReviewPrompt;
  onDone: (o: StepOutcome, progress: BatchProgress | null) => void;
  onSkip: (o: StepOutcome) => void;
}) {
  switch (prompt.tier) {
    case "recognition":
      return <RecognitionCard prompt={prompt} onDone={onDone} />;
    case "cloze":
    case "cued":
      return <TypedCard prompt={prompt} onDone={onDone} />;
    case "free":
      return <FreeProductionCard prompt={prompt} onDone={onDone} onSkip={onSkip} />;
  }
}

/* -------------------------------------------------------- shared fragments */

function TierTag({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10.5px] tracking-wide text-ink-faint uppercase">
      {children}
    </p>
  );
}

function PromotionLine({
  lemma,
  from,
  to,
}: {
  lemma: string;
  from: MasteryState;
  to: MasteryState;
}) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
      <span className="font-serif italic">{lemma}</span> moved up
      <MasteryChip state={from} />
      <ArrowRight className="size-3 text-ink-faint" />
      <MasteryChip state={to} />
    </p>
  );
}

/** `role="status"` so the verdict is announced, not only tinted (the icons never carry it alone). */
function GradeBanner({
  passed,
  children,
}: {
  passed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        // Wash + a 3px accent rule on the left edge — the wash tints this bar only.
        "flex items-center gap-2.5 rounded-sm border-l-[3px] px-3.5 py-3",
        passed ? "border-moss bg-moss-wash" : "border-terracotta bg-terra-wash",
      )}
    >
      {passed ? (
        <CircleCheck className="size-5 shrink-0 text-moss" strokeWidth={1.75} />
      ) : (
        <CircleX
          className="size-5 shrink-0 text-terracotta"
          strokeWidth={1.75}
        />
      )}
      <p
        className={cn(
          "text-sm font-medium",
          passed ? "text-moss" : "text-terracotta",
        )}
      >
        {children}
      </p>
    </div>
  );
}

function NextButton({
  onClick,
  label = "Next",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button size="lg" className="h-12 w-full" onClick={onClick} autoFocus>
      {label} <ArrowRight data-slot="icon" />
    </Button>
  );
}

/** The confirm step every tier shares — selecting or typing an answer never submits it. */
function CheckButton({
  busy,
  disabled,
  ...props
}: { busy: boolean } & React.ComponentProps<typeof Button>) {
  return (
    <Button
      size="lg"
      className="h-12 w-full"
      disabled={disabled || busy}
      {...props}
    >
      {busy ? "Checking…" : "Check"}
    </Button>
  );
}

/** The move to record for the session summary, if the pass changed the word's rung. */
function moveOf(
  view: Extract<ReviewOutcomeView, { kind: "deterministic" | "judged" }>,
): { from: MasteryState; to: MasteryState } | undefined {
  return view.previousMastery !== view.mastery
    ? { from: view.previousMastery, to: view.mastery }
    : undefined;
}

/* ------------------------------------------------- recognition (MCQ, Seen) */

function RecognitionCard({
  prompt,
  onDone,
}: {
  prompt: Extract<ReviewPrompt, { tier: "recognition" }>;
  onDone: (o: StepOutcome, progress: BatchProgress | null) => void;
}) {
  const options = useShuffled(prompt.options);
  // BAT-15: card-shown timestamp — StepCard remounts per presentation, so seeding once is exact.
  const [shownAt] = useState(() => Date.now());
  const [chosen, setChosen] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<
    ReviewOutcomeView,
    { kind: "deterministic" }
  > | null>(null);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [busy, setBusy] = useState(false);

  const target = result?.lemma ?? null;
  const definitionId = `gloss-${prompt.senseId}`;

  const grade = async () => {
    if (chosen === null || result !== null || busy) return;
    setBusy(true);
    try {
      const res = await submitReviewFn({
        data: {
          senseId: prompt.senseId,
          response: chosen,
          scaffolded: false,
          durationMs: Date.now() - shownAt,
        },
      });
      if (res.view.kind === "deterministic") {
        setResult(res.view);
        setProgress(res.progress);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <TierTag>recognition · {prompt.mastery.toLowerCase()}</TierTag>
      <EntryHeader
        pos={prompt.pos}
        heading="Choose the word this definition describes"
      >
        {result !== null ? (
          result.lemma
        ) : chosen !== null ? (
          /* Provisional: a pick set in pencil. A wrong guess must not be typeset as the entry itself. */
          <span className="border-b-2 border-marigold text-ink-soft">
            {chosen}
          </span>
        ) : (
          <HeadwordBlank />
        )}
      </EntryHeader>
      <EntryDefinition id={definitionId}>{prompt.meaning}</EntryDefinition>
      <WordOptionList
        options={options}
        value={chosen}
        onChange={setChosen}
        graded={result !== null}
        disabled={result !== null || busy}
        correct={target}
        labelledBy={definitionId}
      />
      {result ? (
        <div className="space-y-4">
          <GradeBanner passed={result.passed}>
            {result.passed
              ? "Correct."
              : `The word was “${result.lemma}” — it’ll come around again soon.`}
          </GradeBanner>
          {/* MCQ pass alone never promotes (SM-3) — no ladder movement here. */}
          <NextButton
            onClick={() =>
              onDone(
                {
                  lemma: result.lemma,
                  tier: "recognition",
                  outcome: result.passed ? "pass" : "fail",
                },
                progress,
              )
            }
          />
        </div>
      ) : (
        <CheckButton busy={busy} disabled={chosen === null} onClick={grade} />
      )}
    </div>
  );
}

/* ---------------------------------------- cloze + cued (typed, lemma-match) */

/** One cloze soft bounce as shown (FIT-7). `typed` freezes the word the callout talks about. */
interface SoftBounceView {
  lane: ClozeSoftBounceLane;
  typed: string;
  hintPrefix: string;
  gloss: string | null;
}

function TypedCard({
  prompt,
  onDone,
}: {
  prompt: Extract<ReviewPrompt, { tier: "cloze" | "cued" }>;
  onDone: (o: StepOutcome, progress: BatchProgress | null) => void;
}) {
  // BAT-15: card-shown timestamp (see RecognitionCard). A soft bounce keeps the card live and the
  // clock running — the whole presentation is one duration.
  const [shownAt] = useState(() => Date.now());
  const [value, setValue] = useState("");
  const [result, setResult] = useState<Extract<
    ReviewOutcomeView,
    { kind: "deterministic" }
  > | null>(null);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [busy, setBusy] = useState(false);
  // FIT-7/FIT-8: per-presentation soft-bounce state (the RL-6 `bounceCount` pattern) — the
  // use-case is stateless, so the client carries the count + lanes into each submit. Reset on
  // advance is free: StepCard remounts per batch card.
  const [softBounce, setSoftBounce] = useState<SoftBounceView | null>(null);
  const [softBounces, setSoftBounces] = useState(0);
  const [softLanes, setSoftLanes] = useState<ClozeSoftBounceLane[]>([]);

  const grade = async () => {
    setBusy(true);
    try {
      const res = await submitReviewFn({
        data: {
          senseId: prompt.senseId,
          response: value,
          scaffolded: false,
          priorSoftBounces: softBounces,
          priorSoftBounceLanes: softLanes,
          durationMs: Date.now() - shownAt,
        },
      });
      if (res.view.kind === "deterministic") {
        setSoftBounce(null);
        setResult(res.view);
        setProgress(res.progress);
      } else if (res.view.kind === "clozeSoftBounce") {
        // No rating happened (FIT-7): stay on the card, show the lane's cue, keep the input live.
        // BAT-7: the bar did not tick — the server only stamped the interaction.
        const view = res.view;
        setSoftBounces(view.bounces);
        setSoftLanes((lanes) => [...lanes, view.lane]);
        setSoftBounce({
          lane: view.lane,
          typed: value,
          hintPrefix: view.hintPrefix,
          gloss: view.gloss,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const move = result ? moveOf(result) : undefined;
  const bodyId = `body-${prompt.senseId}`;

  /* The cued input is described by the gloss beside it; the cloze input SITS INSIDE its sentence, so an
   * `aria-describedby` back at that sentence would point a node at its own ancestor. */
  const answerBlank = (variant: "headword" | "inline", label: string) =>
    result !== null ? (
      <BlankAnswer variant={variant} passed={result.passed}>
        {value}
      </BlankAnswer>
    ) : (
      <BlankInput
        variant={variant}
        autoFocus
        aria-label={label}
        {...(variant === "headword" ? { "aria-describedby": bodyId } : {})}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
      />
    );

  /*
   * Where the answer resolves differs by tier, because it follows where the learner wrote it. Cloze types
   * into the sentence, so the headword is free to reveal the entry the moment it is graded; cued types into
   * the headword itself, so that slot must keep showing what they wrote — the banner does the revealing.
   */
  const headword =
    prompt.tier === "cloze" ? (
      result !== null ? (
        result.lemma
      ) : value === "" ? (
        <HeadwordBlank />
      ) : (
        /* Mirrors the sentence input; aria-hidden so it is not read as a second field. */
        <span aria-hidden className="border-b-2 border-marigold text-ink-soft">
          {value}
        </span>
      )
    ) : (
      answerBlank("headword", "The word this definition describes")
    );

  return (
    <div className="space-y-6">
      <TierTag>
        {prompt.tier === "cloze"
          ? `cloze · ${prompt.mastery.toLowerCase()}`
          : `produce the word · ${prompt.mastery.toLowerCase()}`}
      </TierTag>
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && result === null && value.trim().length > 0) grade();
        }}
      >
        <EntryHeader
          pos={prompt.pos}
          heading={
            prompt.tier === "cloze"
              ? "Fill in the missing word"
              : "Write the word this definition describes"
          }
        >
          {headword}
        </EntryHeader>

        {prompt.tier === "cloze" ? (
          <ClozeSentence clozedSentence={prompt.clozedSentence}>
            {answerBlank("inline", "The missing word")}
          </ClozeSentence>
        ) : (
          <EntryDefinition id={bodyId}>{prompt.meaning}</EntryDefinition>
        )}

        {/* FIT-7: a soft bounce leaves the card live — the callout cues, the input stays open. */}
        {softBounce !== null && result === null ? (
          <SoftBounceCallout
            lane={softBounce.lane}
            typed={softBounce.typed}
            hintPrefix={softBounce.hintPrefix}
            gloss={softBounce.gloss}
          />
        ) : null}

        {result === null ? (
          <CheckButton
            type="submit"
            busy={busy}
            disabled={value.trim().length === 0}
          />
        ) : null}
      </form>
      {result ? (
        <div className="space-y-4">
          <GradeBanner passed={result.passed}>
            {result.passed
              ? "Correct."
              : `It was “${result.lemma}” — we’ll show it again soon.`}
            {/* deterministic fails reschedule only; never demote (SM-6) */}
          </GradeBanner>
          {move ? (
            <PromotionLine lemma={result.lemma} from={move.from} to={move.to} />
          ) : null}
          <NextButton
            onClick={() =>
              onDone(
                {
                  lemma: result.lemma,
                  tier: prompt.tier,
                  outcome: result.passed ? "pass" : "fail",
                  ...(move ? { moved: move } : {}),
                },
                progress,
              )
            }
          />
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------- free production / maintenance (judged) */

type JudgedView = Extract<ReviewOutcomeView, { kind: "judged" }>;

type FreeState =
  | { phase: "writing" }
  | { phase: "checking" } // NET-2, only after a rule-layer pass
  | { phase: "capped"; modelSentence: string | null } // RL-6 model-sentence reveal
  | { phase: "offline" } // NET-5
  | { phase: "unavailable" } // NET-3/4
  | { phase: "verdict"; result: JudgedView };

function FreeProductionCard({
  prompt,
  onDone,
  onSkip,
}: {
  prompt: Extract<ReviewPrompt, { tier: "free" }>;
  onDone: (o: StepOutcome, progress: BatchProgress | null) => void;
  onSkip: (o: StepOutcome) => void;
}) {
  const { senseId, lemma, mastery } = prompt;
  const maintenance = mastery === "Fluent";
  const tier: StepOutcome["tier"] = maintenance ? "maintenance" : "free";

  // BAT-15: card-shown timestamp; the server adds the judge wait to this client-measured span.
  const [shownAt] = useState(() => Date.now());
  const [text, setText] = useState("");
  const [state, setState] = useState<FreeState>({ phase: "writing" });
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [bounce, setBounce] = useState<
    Extract<ReviewOutcomeView, { kind: "bounce" }>["reason"] | null
  >(null);
  const [bounceCount, setBounceCount] = useState(0);
  const [anySentence, setAnySentence] = useState(false); // TIER-7 learner-activated fallback
  const [fallbackOffered, setFallbackOffered] = useState(false);
  const [starter, setStarter] = useState(false); // SM-9 scaffolded flag

  const submit = async () => {
    setBounce(null);

    // NET-5: block the round-trip entirely when offline — never call the judge, no rating (INV-2).
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setState({ phase: "offline" });
      return;
    }

    // Phase 1 — the instant, judge-free rule check (NET-2: no "checking…" before a bounce).
    const check = await ruleCheckFn({
      data: { senseId, response: text, priorBounces: bounceCount },
    });
    if (!check.ok) {
      setBounceCount(check.bounces);
      if (check.reason === "degenerate" && !anySentence)
        setFallbackOffered(true); // TIER-7 offer
      if (check.revealModelSentence) {
        setState({ phase: "capped", modelSentence: check.modelSentence }); // RL-6
      } else {
        setBounce(check.reason);
      }
      return;
    }

    // Phase 2 — the judge round-trip (show "checking…" while it runs).
    setState({ phase: "checking" });
    const res = await submitReviewFn({
      data: {
        senseId,
        response: text,
        scaffolded: starter,
        durationMs: Date.now() - shownAt,
      },
    });
    if (res.view.kind === "unavailable") setState({ phase: "unavailable" });
    else if (res.view.kind === "judged") {
      setProgress(res.progress);
      setState({ phase: "verdict", result: res.view });
    } else setState({ phase: "writing" }); // bounce handled in phase 1 — defensive
  };

  const finish = (result: JudgedView) => {
    const move = moveOf(result);
    onDone(
      {
        lemma,
        tier,
        outcome: result.passed ? "pass" : "fail",
        judged: true, // counts toward the daily goal (CNT-8, INV-4)
        ...(move ? { moved: move } : {}),
      },
      progress,
    );
  };

  const header = (
    <>
      <TierTag>
        free production · {mastery.toLowerCase()}
        {maintenance ? " · maintenance" : ""}
        {starter ? " · scaffolded" : ""}
      </TierTag>
      {/* The heading names the task, not the word — the visible headword already announces the lemma. */}
      <EntryHeader pos={prompt.pos} heading="Write a sentence using this word">
        {lemma}
      </EntryHeader>
      {/* DM-2: the intended sense is rendered verbatim — the runtime never rewrites a catalog field. */}
      {prompt.intendedSense ? (
        <EntryDefinition>{prompt.intendedSense}</EntryDefinition>
      ) : null}
    </>
  );

  /* RL-6 terminal state: model sentence revealed, retry or skip (no rating either way) */
  if (state.phase === "capped") {
    return (
      <div className="space-y-6">
        {header}
        <p className="text-sm leading-relaxed text-ink-soft">
          Here’s the example to lean on:
        </p>
        {state.modelSentence ? (
          <blockquote className="border-l-2 border-marigold pl-4 font-serif text-xl leading-relaxed text-ink">
            {state.modelSentence}
          </blockquote>
        ) : null}
        <div className="space-y-3">
          <Button
            size="lg"
            className="h-12 w-full"
            onClick={() => {
              setBounceCount(0);
              setBounce(null);
              setState({ phase: "writing" });
            }}
          >
            Try once more
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 w-full"
            onClick={() => onSkip({ lemma, tier, outcome: "skip" })}
          >
            Skip for now
          </Button>
          <p className="text-center text-xs text-ink-faint">
            Skipping is fine — it stays due and doesn’t count against you.
          </p>
        </div>
      </div>
    );
  }

  if (state.phase === "verdict") {
    const r = state.result;
    return (
      <div className="space-y-6">
        {header}
        <VerdictPanel
          passed={r.passed}
          rawSentence={text}
          replacements={r.replacements}
          {...(r.correctedSentence
            ? { correctedSentence: r.correctedSentence }
            : {})}
          {...(r.detectedSense ? { detectedSense: r.detectedSense } : {})}
          intendedSense={r.intendedSense}
          {...(r.enrichment ? { enrichment: r.enrichment } : {})}
          lemma={lemma}
          {...(r.passed ? {} : { demotedTo: r.mastery })}
        />
        {!r.passed ? (
          /* SM-8: further sentences are unscored for this review */
          <div className="space-y-2">
            <p className="text-xs text-ink-faint">
              Keep practicing if you like — this one’s already recorded.
            </p>
            <Textarea
              placeholder={`Another sentence with “${lemma}”…`}
              className="min-h-20 font-serif text-xl"
            />
          </div>
        ) : null}
        <NextButton onClick={() => finish(r)} />
      </div>
    );
  }

  const busy = state.phase === "checking";

  return (
    <div className="space-y-6">
      {header}
      <p className="text-sm leading-relaxed text-ink-soft">
        {anySentence ? (
          <>
            Write any sentence using{" "}
            <span className="font-serif italic">{lemma}</span>.
          </>
        ) : (
          <>
            Write a sentence using{" "}
            <span className="font-serif italic">{lemma}</span> — ideally
            something true about you. {prompt.selfReferencePrompt}
          </>
        )}
      </p>

      <div className="space-y-3">
        <Textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          placeholder="Your sentence…"
          className="min-h-24 font-serif text-xl leading-relaxed"
        />

        {starter ? (
          <p className="flex items-start gap-2 rounded-lg bg-marigold-wash px-3.5 py-2.5 text-sm text-ink-soft">
            <Lightbulb
              className="mt-0.5 size-4 shrink-0 text-marigold-deep"
              strokeWidth={1.5}
            />
            Try starting with: “Last month, I…” (using a starter is recorded —
            it just doesn’t count as unscaffolded)
          </p>
        ) : null}

        {bounce ? <BounceCallout kind={bounce} lemma={lemma} /> : null}

        {/* TIER-7: the offer is surfaced; the mode switches ONLY on the tap */}
        {fallbackOffered && !anySentence ? (
          <Button
            variant="outline"
            onClick={() => setAnySentence(true)}
            className="h-auto w-full justify-start border-dashed px-3.5 py-2.5 text-left text-sm font-normal whitespace-normal text-ink-soft"
          >
            <span>
              Stuck on something true about you?{" "}
              <span className="font-medium text-ink">
                Just write any sentence.
              </span>
            </span>
          </Button>
        ) : null}

        {state.phase === "offline" ? (
          <p className="flex items-center gap-2 rounded-lg bg-paper-sunken px-3.5 py-3 text-sm text-ink-soft">
            <CloudOff
              className="size-4 shrink-0 text-ink-faint"
              strokeWidth={1.5}
            />
            You’re offline — reconnect to check this sentence.
          </p>
        ) : null}
        {state.phase === "unavailable" ? (
          <div className="space-y-3">
            <p className="rounded-lg bg-paper-sunken px-3.5 py-3 text-sm text-ink-soft">
              Couldn’t check that one — try again. Your sentence is still here.
            </p>
            {/* BAT-8: a persistent outage must not stall the batch — the skip shrinks it; the card
                stays due and unrated (INV-2). */}
            <Button
              size="lg"
              variant="outline"
              className="h-12 w-full"
              onClick={() => onSkip({ lemma, tier, outcome: "skip" })}
            >
              Skip for now
            </Button>
          </div>
        ) : null}

        {busy ? (
          <CheckingIndicator />
        ) : (
          <div className="flex items-center gap-3">
            <Button
              size="lg"
              className="h-12 flex-1"
              onClick={submit}
              disabled={text.trim().length === 0}
            >
              Check my sentence
            </Button>
            {!starter ? (
              <Button
                variant="ghost"
                size="lg"
                className="h-12"
                onClick={() => setStarter(true)}
              >
                Show a starter
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
