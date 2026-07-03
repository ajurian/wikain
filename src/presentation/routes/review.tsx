/*
 * /review — the session screen (chromeless focus mode).
 *
 * DESIGN BUILD, MOCK-DRIVEN: everything here renders from src/presentation/mock/*
 * (see the MOCK headers there for the demo triggers). No server function is
 * called; when wiring, swap the mock imports for server/review.ts and delete
 * the mocks. State map: design-system/references/screen-states.md.
 */
import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, CircleCheck, CircleX, CloudOff, Lightbulb, X } from "lucide-react";

import { mockItem, type MockLexicalItem } from "../mock/catalog";
import { MOCK_WORDS, type MasteryState } from "../mock/learner";
import { MOCK_SESSION, mockLemmaMatch, mockMcqOptions, type MockSessionStep } from "../mock/session";
import { mockJudgeSubmit, mockRuleLayer, type MockBounceKind, type MockJudgeResult } from "../mock/judge";

import { BounceCallout } from "../components/bounce-callout";
import { CheckingIndicator } from "../components/checking-indicator";
import { MasteryChip } from "../components/mastery-chip";
import { SessionSummary, type StepOutcome } from "../components/session-summary";
import { VerdictPanel } from "../components/verdict-panel";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/review")({
  component: ReviewSession,
});

/** MAX_RULE_BOUNCE_RETRIES (RL-6). Mirrored from spec constants — replace when wiring. */
const MAX_RULE_BOUNCE_RETRIES = 3;

const LADDER: MasteryState[] = ["New", "Seen", "Recognized", "Productive", "Fluent"];

function masteryOf(senseId: string): MasteryState {
  return MOCK_WORDS.find((w) => w.senseId === senseId)?.mastery ?? "New";
}

function demoteOneRung(state: MasteryState): MasteryState {
  // SM-6/SM-7: one rung down, floor at Recognized.
  const i = LADDER.indexOf(state);
  return LADDER[Math.max(2, i - 1)] as MasteryState;
}

/* ------------------------------------------------------------------ shell */

function ReviewSession() {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<StepOutcome[]>([]);
  const total = MOCK_SESSION.length;
  const step = MOCK_SESSION[index];

  const handleDone = (outcome: StepOutcome) => {
    setResults((r) => [...r, outcome]);
    setIndex((i) => i + 1);
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-4 pb-8">
      {/* thin session chrome: close + progress only (focus mode) */}
      <div className="mb-8 flex items-center gap-4">
        <Link
          to="/"
          aria-label="End session"
          className="rounded-md p-1 text-ink-faint hover:text-ink"
        >
          <X className="size-5" strokeWidth={1.75} />
        </Link>
        <Progress value={Math.min(index, total)} max={total} className="h-1.5" />
        <span className="text-xs font-medium text-ink-faint tabular-nums">
          {Math.min(index + 1, total)}/{total}
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <AnimatePresence mode="wait">
          {step === undefined ? (
            <SessionSummary key="summary" results={results} />
          ) : (
            <StepCard key={index} step={step} onDone={handleDone} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StepCard({ step, onDone }: { step: MockSessionStep; onDone: (o: StepOutcome) => void }) {
  const reduced = useReducedMotion();
  const item = mockItem(step.senseId);
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="w-full"
    >
      {step.tier === "intro" ? <IntroCard item={item} onDone={onDone} /> : null}
      {step.tier === "recognition" ? <RecognitionCard item={item} onDone={onDone} /> : null}
      {step.tier === "cloze" || step.tier === "cued" ? (
        <TypedCard tier={step.tier} item={item} onDone={onDone} />
      ) : null}
      {step.tier === "free" || step.tier === "maintenance" ? (
        <FreeProductionCard maintenance={step.tier === "maintenance"} item={item} onDone={onDone} />
      ) : null}
    </motion.div>
  );
}

/* -------------------------------------------------------- shared fragments */

function TierTag({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">{children}</p>
  );
}

function PromotionLine({ lemma, from, to }: { lemma: string; from: MasteryState; to: MasteryState }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
      <span className="font-serif italic">{lemma}</span> moved up
      <MasteryChip state={from} />
      <ArrowRight className="size-3 text-ink-faint" />
      <MasteryChip state={to} />
    </p>
  );
}

function GradeBanner({ passed, children }: { passed: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3.5 py-3",
        passed ? "bg-moss-wash" : "bg-terracotta-wash",
      )}
    >
      {passed ? (
        <CircleCheck className="size-5 shrink-0 text-moss" strokeWidth={1.75} />
      ) : (
        <CircleX className="size-5 shrink-0 text-terracotta" strokeWidth={1.75} />
      )}
      <p className={cn("text-sm font-medium", passed ? "text-moss" : "text-terracotta")}>
        {children}
      </p>
    </div>
  );
}

function NextButton({ onClick, label = "Next" }: { onClick: () => void; label?: string }) {
  return (
    <Button size="lg" className="w-full" onClick={onClick} autoFocus>
      {label} <ArrowRight data-slot="icon" />
    </Button>
  );
}

/* ----------------------------------------------------- intro (New → Seen) */

function IntroCard({ item, onDone }: { item: MockLexicalItem; onDone: (o: StepOutcome) => void }) {
  return (
    <div className="space-y-6">
      <TierTag>new word</TierTag>
      <div>
        <h1 className="font-serif text-4xl font-semibold text-ink">{item.lemma}</h1>
        <p className="mt-1 text-xs tracking-wide text-ink-faint uppercase">
          {item.pos} · {item.cefr}
        </p>
      </div>
      <p className="font-serif text-xl leading-relaxed text-ink">{item.recognitionMeaning}</p>
      <p className="text-sm leading-relaxed text-ink-soft">“{item.modelSentence}”</p>
      <NextButton
        label="Got it"
        onClick={() =>
          onDone({ lemma: item.lemma, tier: "intro", outcome: "pass", moved: { from: "New", to: "Seen" } })
        }
      />
    </div>
  );
}

/* ------------------------------------------------- recognition (MCQ, Seen) */

function RecognitionCard({
  item,
  onDone,
}: {
  item: MockLexicalItem;
  onDone: (o: StepOutcome) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const options = mockMcqOptions(item.lemma, item.distractors);
  const graded = chosen !== null;
  const passed = chosen === item.lemma;

  return (
    <div className="space-y-6">
      <TierTag>recognition · seen</TierTag>
      <p className="font-serif text-xl leading-relaxed text-ink">
        Which word means: “{item.recognitionMeaning}”?
      </p>
      <div className="space-y-2.5">
        {options.map((opt) => {
          const isTarget = opt === item.lemma;
          const isChosen = opt === chosen;
          return (
            <button
              key={opt}
              type="button"
              disabled={graded}
              onClick={() => setChosen(opt)}
              className={cn(
                "w-full rounded-lg border border-line bg-paper-raised px-4 py-3 text-left font-serif text-lg text-ink transition-colors duration-150",
                !graded && "hover:border-ink-faint",
                // instant deterministic grade (NET-2): color carries the outcome
                graded && isTarget && "border-moss bg-moss-wash",
                graded && isChosen && !isTarget && "border-terracotta bg-terracotta-wash",
                graded && !isChosen && !isTarget && "opacity-50",
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {graded ? (
        <div className="space-y-4">
          <GradeBanner passed={passed}>
            {passed ? "Correct." : `The word was “${item.lemma}” — it’ll come around again soon.`}
          </GradeBanner>
          {/* MCQ pass alone never promotes (SM-3) — no ladder movement here. */}
          <NextButton
            onClick={() => onDone({ lemma: item.lemma, tier: "recognition", outcome: passed ? "pass" : "fail" })}
          />
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------- cloze + cued (typed, lemma-match) */

function TypedCard({
  tier,
  item,
  onDone,
}: {
  tier: "cloze" | "cued";
  item: MockLexicalItem;
  onDone: (o: StepOutcome) => void;
}) {
  const [value, setValue] = useState("");
  const [graded, setGraded] = useState<null | boolean>(null);
  const mastery = masteryOf(item.senseId);

  // Promotions on deterministic passes: cloze pass fires Seen→Recognized when a
  // prior MCQ pass exists (SM-3); a cued pass fires Recognized→Productive (SM-4).
  const promotion: { from: MasteryState; to: MasteryState } | undefined =
    graded === true
      ? tier === "cloze" && mastery === "Seen"
        ? { from: "Seen", to: "Recognized" }
        : tier === "cued" && mastery === "Recognized"
          ? { from: "Recognized", to: "Productive" }
          : undefined
      : undefined;

  const grade = () => setGraded(mockLemmaMatch(value, item.lemma)); // instant (NET-2)

  return (
    <div className="space-y-6">
      <TierTag>{tier === "cloze" ? "cloze · seen" : `produce the word · ${mastery.toLowerCase()}`}</TierTag>
      {tier === "cloze" ? (
        <p className="font-serif text-xl leading-relaxed text-ink">
          {item.clozedSentence.split("_")[0]}
          <span className="mx-1 inline-block w-20 border-b-2 border-ink-faint align-baseline" />
          {item.clozedSentence.split("_")[1]}
        </p>
      ) : (
        <p className="font-serif text-xl leading-relaxed text-ink">{item.productiveMeaning}</p>
      )}
      {graded === null ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            grade();
          }}
        >
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={tier === "cloze" ? "the missing word" : "type the word"}
            className="h-12 font-serif text-xl"
          />
          <Button type="submit" size="lg" className="w-full" disabled={value.trim().length === 0}>
            Check
          </Button>
        </form>
      ) : (
        <div className="space-y-4">
          <GradeBanner passed={graded}>
            {graded
              ? "Correct."
              : `It was “${item.lemma}” — we’ll show it again soon.`}
            {/* deterministic fails reschedule only; never demote (SM-6) */}
          </GradeBanner>
          {promotion ? <PromotionLine lemma={item.lemma} from={promotion.from} to={promotion.to} /> : null}
          <NextButton
            onClick={() =>
              onDone({
                lemma: item.lemma,
                tier,
                outcome: graded ? "pass" : "fail",
                ...(promotion ? { moved: promotion } : {}),
              })
            }
          />
        </div>
      )}
    </div>
  );
}

/* -------------------------------- free production / maintenance (judged) */

type FreeState =
  | { phase: "writing" }
  | { phase: "checking" } // NET-2, only after rule-layer pass
  | { phase: "capped" } // RL-6 model-sentence reveal
  | { phase: "offline" } // NET-5
  | { phase: "unavailable" } // NET-3/4
  | { phase: "verdict"; result: Extract<MockJudgeResult, { kind: "judged" }> };

function FreeProductionCard({
  item,
  maintenance,
  onDone,
}: {
  item: MockLexicalItem;
  maintenance: boolean;
  onDone: (o: StepOutcome) => void;
}) {
  const [text, setText] = useState("");
  const [state, setState] = useState<FreeState>({ phase: "writing" });
  const [bounce, setBounce] = useState<MockBounceKind | null>(null);
  const [bounceCount, setBounceCount] = useState(0);
  const [anySentence, setAnySentence] = useState(false); // TIER-7 learner-activated fallback
  const [fallbackOffered, setFallbackOffered] = useState(false);
  const [starter, setStarter] = useState(false); // SM-9 scaffolded flag
  const mastery = masteryOf(item.senseId);

  const submit = async () => {
    setBounce(null);
    // Rule layer is synchronous & instant — "checking…" must never precede a bounce (NET-2).
    const bounced = mockRuleLayer(text, item);
    if (bounced) {
      const n = bounceCount + 1;
      setBounceCount(n);
      if (bounced === "degenerate" && !anySentence) setFallbackOffered(true); // TIER-7 offer
      if (n >= MAX_RULE_BOUNCE_RETRIES) {
        setState({ phase: "capped" }); // RL-6: reveal model sentence + skip
      } else {
        setBounce(bounced);
      }
      return;
    }
    setState({ phase: "checking" });
    const result = await mockJudgeSubmit(text, item);
    if (result.kind === "offline") setState({ phase: "offline" });
    else if (result.kind === "unavailable") setState({ phase: "unavailable" });
    else if (result.kind === "judged") setState({ phase: "verdict", result });
    else setState({ phase: "writing" }); // bounce already handled above; defensive
  };

  const finish = (result: Extract<MockJudgeResult, { kind: "judged" }>) => {
    onDone({
      lemma: item.lemma,
      tier: maintenance ? "maintenance" : "free",
      outcome: result.passed ? "pass" : "fail",
      judged: true, // counts toward the daily goal (CNT-8, INV-4)
      ...(result.passed
        ? {}
        : { moved: { from: mastery, to: demoteOneRung(mastery) } }),
    });
  };

  const header = (
    <>
      <TierTag>
        free production · {mastery.toLowerCase()}
        {maintenance ? " · maintenance" : ""}
        {starter ? " · scaffolded" : ""}
      </TierTag>
      <div>
        <h1 className="font-serif text-4xl font-semibold text-ink">{item.lemma}</h1>
        <p className="mt-1 text-xs tracking-wide text-ink-faint uppercase">
          {item.pos} · {item.cefr}
        </p>
      </div>
    </>
  );

  /* RL-6 terminal state: model sentence revealed, retry or skip (no rating either way) */
  if (state.phase === "capped") {
    return (
      <div className="space-y-6">
        {header}
        <p className="text-sm leading-relaxed text-ink-soft">Here’s the example to lean on:</p>
        <blockquote className="border-l-2 border-amber pl-4 font-serif text-xl leading-relaxed text-ink">
          {item.modelSentence}
        </blockquote>
        <div className="space-y-3">
          <Button
            size="lg"
            className="w-full"
            onClick={() => {
              setBounceCount(0);
              setState({ phase: "writing" });
            }}
          >
            Try once more
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full"
            onClick={() =>
              onDone({ lemma: item.lemma, tier: maintenance ? "maintenance" : "free", outcome: "skip" })
            }
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
          {...(r.correctedSentence ? { correctedSentence: r.correctedSentence } : {})}
          {...(r.detectedSense ? { detectedSense: r.detectedSense } : {})}
          intendedSense={item.recognitionMeaning}
          {...(r.enrichment ? { enrichment: r.enrichment } : {})}
          lemma={item.lemma}
          {...(r.passed ? {} : { demotedTo: demoteOneRung(mastery) })}
        />
        {!r.passed ? (
          /* SM-8: further sentences are unscored for this review */
          <div className="space-y-2">
            <p className="text-xs text-ink-faint">
              Keep practicing if you like — this one’s already recorded.
            </p>
            <Textarea
              placeholder={`Another sentence with “${item.lemma}”…`}
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
          <>Write any sentence using <span className="font-serif italic">{item.lemma}</span>.</>
        ) : (
          <>
            Write a sentence using <span className="font-serif italic">{item.lemma}</span> — ideally
            something true about you. {item.selfReferencePrompt}
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
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-deep" strokeWidth={1.5} />
            Try starting with: “Last month, I…” (using a starter is recorded — it just doesn’t count
            as unscaffolded)
          </p>
        ) : null}

        {bounce ? <BounceCallout kind={bounce} lemma={item.lemma} /> : null}

        {/* TIER-7: the offer is surfaced; the mode switches ONLY on the tap */}
        {fallbackOffered && !anySentence ? (
          <button
            type="button"
            onClick={() => setAnySentence(true)}
            className="w-full rounded-lg border border-dashed border-line px-3.5 py-2.5 text-left text-sm text-ink-soft hover:border-ink-faint"
          >
            Stuck on something true about you?{" "}
            <span className="font-medium text-ink">Just write any sentence.</span>
          </button>
        ) : null}

        {state.phase === "offline" ? (
          <p className="flex items-center gap-2 rounded-lg bg-paper-sunken px-3.5 py-3 text-sm text-ink-soft">
            <CloudOff className="size-4 shrink-0 text-ink-faint" strokeWidth={1.5} />
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
              className="flex-1"
              onClick={submit}
              disabled={text.trim().length === 0}
            >
              Check my sentence
            </Button>
            {!starter ? (
              <Button variant="ghost" size="lg" onClick={() => setStarter(true)}>
                Show a starter
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
