/*
 * /review — the session screen (chromeless focus mode), WIRED to the real backend.
 *
 * Server-driven (STACK-2): `startSessionFn` seeds + orders the queue (LOOP-1), `resolvePromptFn`
 * resolves each word's tier + render fields (the correct answer is withheld for MCQ/cloze/cued —
 * grading is server-side), and grading runs through `runReviewPass` behind `submitReviewFn`
 * (deterministic) / `ruleCheckFn` + `submitReviewFn` (judged). The judged tier is two-phase so the
 * "checking…" indicator never precedes a bounce (NET-2): the instant rule-check decides bounces with
 * no judge round-trip, then a rule-pass shows the indicator while the judge runs.
 *
 * All four tiers are typeset as one dictionary entry — `EntryHeader` (headword slot + italic pos + the
 * hairline rule) over `EntryDefinition` — so the same word read four ways looks like the same artifact.
 * Answering is never submitting: every tier selects or types, then confirms with `CheckButton`.
 *
 * The New→Seen "intro" card is intentionally dropped (seeded words start at Seen; their first review is
 * the recognition MCQ) — that surfacing is a deferred seeding concern.
 */
import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { usePrefetchQuery, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
  startSessionFn,
  resolvePromptFn,
  ruleCheckFn,
  submitReviewFn,
} from "../../../server/review";
import type { ReviewPrompt } from "../../../../application/resolveReviewPrompt.js";
import type { ReviewOutcomeView } from "../../../../application/presentReviewOutcome.js";
import type { MasteryState } from "../../../../domain/mastery/card.js";

import { BounceCallout } from "../../../components/bounce-callout";
import { BlankAnswer, BlankInput } from "../../../components/blank-input";
import { CheckingIndicator } from "../../../components/checking-indicator";
import {
  EntryDefinition,
  EntryHeader,
  HeadwordBlank,
} from "../../../components/entry-header";
import {
  SessionSummary,
  type StepOutcome,
} from "../../../components/session-summary";
import { VerdictPanel } from "../../../components/verdict-panel";
import { MasteryChip } from "../../../components/mastery-chip";
import { WordOptionList } from "../../../components/word-option-list";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_onboarded/review")({
  component: ReviewSession,
});

/** A stable random shuffle computed once per mount (real MCQ shuffle-on-render, TIER-2). */
function useShuffled<T>(items: readonly T[]): T[] {
  return useMemo(() => {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shuffle once per mount, not per render
  }, []);
}

/* ------------------------------------------------------------------ shell */

function ReviewSession() {
  const session = useQuery({
    queryKey: ["review-session"],
    queryFn: () => startSessionFn(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<StepOutcome[]>([]);

  const queue = session.data?.queue ?? [];
  const total = queue.length;
  const senseId = queue[index];

  const handleDone = (outcome: StepOutcome) => {
    setResults((r) => [...r, outcome]);
    setIndex((i) => i + 1);
  };

  /** Prefetch the next prompt to improve performance */
  usePrefetchQuery({
    queryKey: ["review-prompt", queue[index + 1]],
    queryFn: () => resolvePromptFn({ data: queue[index + 1] }),
    staleTime: Infinity,
  });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-4 pb-8 relative">
      {/* thin session chrome: close + progress only (focus mode) */}
      <div className="mb-8 flex items-center gap-4">
        <Link
          to="/"
          aria-label="End session"
          className="rounded-md p-1 text-ink-faint hover:text-ink"
        >
          <X className="size-5" strokeWidth={1.75} />
        </Link>
        <Progress
          aria-label="Session progress"
          value={Math.min(index, total)}
          max={Math.max(total, 1)}
          className="h-1.5"
        />
        <span className="text-xs font-medium text-ink-faint tabular-nums">
          {total === 0 ? "0/0" : `${Math.min(index + 1, total)}/${total}`}
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-center">
        {session.isPending ? (
          <CenteredSpinner label="Preparing your session…" />
        ) : session.isError ? (
          <p className="text-center text-sm text-terracotta">
            Couldn’t start your session. Please try again.
          </p>
        ) : (
          <AnimatePresence mode="wait">
            {senseId === undefined ? (
              <SessionSummary key="summary" results={results} />
            ) : (
              <StepCard key={index} senseId={senseId} onDone={handleDone} />
            )}
          </AnimatePresence>
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

/** Fetches the prompt for one queued word and routes to the matching tier card. */
function StepCard({
  senseId,
  onDone,
}: {
  senseId: string;
  onDone: (o: StepOutcome) => void;
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
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="w-full"
    >
      {prompt.isPending ? (
        <CenteredSpinner label="Loading…" />
      ) : prompt.isError || prompt.data === undefined ? (
        <p className="text-center text-sm text-terracotta">
          Couldn’t load this one.
        </p>
      ) : (
        <PromptCard prompt={prompt.data} onDone={onDone} />
      )}
    </motion.div>
  );
}

function PromptCard({
  prompt,
  onDone,
}: {
  prompt: ReviewPrompt;
  onDone: (o: StepOutcome) => void;
}) {
  switch (prompt.tier) {
    case "recognition":
      return <RecognitionCard prompt={prompt} onDone={onDone} />;
    case "cloze":
    case "cued":
      return <TypedCard prompt={prompt} onDone={onDone} />;
    case "free":
      return <FreeProductionCard prompt={prompt} onDone={onDone} />;
  }
}

/* -------------------------------------------------------- shared fragments */

function TierTag({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">
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
        "flex items-center gap-2.5 rounded-lg px-3.5 py-3",
        passed ? "bg-moss-wash" : "bg-terracotta-wash",
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
  onDone: (o: StepOutcome) => void;
}) {
  const options = useShuffled(prompt.options);
  const [chosen, setChosen] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<
    ReviewOutcomeView,
    { kind: "deterministic" }
  > | null>(null);
  const [busy, setBusy] = useState(false);

  const target = result?.lemma ?? null;
  const definitionId = `gloss-${prompt.senseId}`;

  const grade = async () => {
    if (chosen === null || result !== null || busy) return;
    setBusy(true);
    try {
      const view = await submitReviewFn({
        data: { senseId: prompt.senseId, response: chosen, scaffolded: false },
      });
      if (view.kind === "deterministic") setResult(view);
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
          <span className="border-b-2 border-amber text-ink-soft">
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
              onDone({
                lemma: result.lemma,
                tier: "recognition",
                outcome: result.passed ? "pass" : "fail",
              })
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

function TypedCard({
  prompt,
  onDone,
}: {
  prompt: Extract<ReviewPrompt, { tier: "cloze" | "cued" }>;
  onDone: (o: StepOutcome) => void;
}) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<Extract<
    ReviewOutcomeView,
    { kind: "deterministic" }
  > | null>(null);
  const [busy, setBusy] = useState(false);

  const grade = async () => {
    setBusy(true);
    try {
      const view = await submitReviewFn({
        data: { senseId: prompt.senseId, response: value, scaffolded: false },
      });
      if (view.kind === "deterministic") setResult(view);
    } finally {
      setBusy(false);
    }
  };

  const move = result ? moveOf(result) : undefined;
  const bodyId = `body-${prompt.senseId}`;

  /* `clozed_sentence` carries exactly one `_` (docs/BUILD.md §7.1) — the blank is where the input goes. */
  const clozeParts =
    prompt.tier === "cloze" ? prompt.clozedSentence.split("_") : null;

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
        <span aria-hidden className="border-b-2 border-amber text-ink-soft">
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

        {/* `leading-relaxed` is restated: tailwind-merge drops it when `text-xl` overrides `text-lg`. */}
        {prompt.tier === "cloze" ? (
          <EntryDefinition id={bodyId} className="text-xl leading-relaxed">
            {clozeParts?.[0]}
            {answerBlank("inline", "The missing word")}
            {clozeParts?.[1]}
          </EntryDefinition>
        ) : (
          <EntryDefinition id={bodyId}>{prompt.meaning}</EntryDefinition>
        )}

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
              onDone({
                lemma: result.lemma,
                tier: prompt.tier,
                outcome: result.passed ? "pass" : "fail",
                ...(move ? { moved: move } : {}),
              })
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
}: {
  prompt: Extract<ReviewPrompt, { tier: "free" }>;
  onDone: (o: StepOutcome) => void;
}) {
  const { senseId, lemma, mastery } = prompt;
  const maintenance = mastery === "Fluent";
  const tier: StepOutcome["tier"] = maintenance ? "maintenance" : "free";

  const [text, setText] = useState("");
  const [state, setState] = useState<FreeState>({ phase: "writing" });
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
    const view = await submitReviewFn({
      data: { senseId, response: text, scaffolded: starter },
    });
    if (view.kind === "unavailable") setState({ phase: "unavailable" });
    else if (view.kind === "judged")
      setState({ phase: "verdict", result: view });
    else setState({ phase: "writing" }); // bounce handled in phase 1 — defensive
  };

  const finish = (result: JudgedView) => {
    const move = moveOf(result);
    onDone({
      lemma,
      tier,
      outcome: result.passed ? "pass" : "fail",
      judged: true, // counts toward the daily goal (CNT-8, INV-4)
      ...(move ? { moved: move } : {}),
    });
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
          <blockquote className="border-l-2 border-amber pl-4 font-serif text-xl leading-relaxed text-ink">
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
            onClick={() => onDone({ lemma, tier, outcome: "skip" })}
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
          <p className="flex items-start gap-2 rounded-lg bg-amber-wash px-3.5 py-2.5 text-sm text-ink-soft">
            <Lightbulb
              className="mt-0.5 size-4 shrink-0 text-amber-deep"
              strokeWidth={1.5}
            />
            Try starting with: “Last month, I…” (using a starter is recorded —
            it just doesn’t count as unscaffolded)
          </p>
        ) : null}

        {bounce ? <BounceCallout kind={bounce} lemma={lemma} /> : null}

        {/* TIER-7: the offer is surfaced; the mode switches ONLY on the tap */}
        {fallbackOffered && !anySentence ? (
          <button
            type="button"
            onClick={() => setAnySentence(true)}
            className="w-full rounded-lg border border-dashed border-line px-3.5 py-2.5 text-left text-sm text-ink-soft hover:border-ink-faint"
          >
            Stuck on something true about you?{" "}
            <span className="font-medium text-ink">
              Just write any sentence.
            </span>
          </button>
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
          <p className="rounded-lg bg-paper-sunken px-3.5 py-3 text-sm text-ink-soft">
            Couldn’t check that one — try again. Your sentence is still here.
          </p>
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
