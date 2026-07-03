/*
 * /onboarding — first-session flow (SEED-1): a production win comes BEFORE any
 * long calibration. welcome → coarse level → two seeded words → first written
 * sentence (judged) → only then the optional "tune your level" placement
 * (per-word marking + LexTALE entry — SEED-2/3/4, both skippable).
 *
 * DESIGN BUILD, MOCK-DRIVEN — see src/presentation/mock/* headers.
 */
import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, CircleCheck } from "lucide-react";

import { mockItem } from "../mock/catalog";
import { mockJudgeSubmit, mockRuleLayer, type MockBounceKind } from "../mock/judge";
import { BounceCallout } from "../components/bounce-callout";
import { CheckingIndicator } from "../components/checking-indicator";
import { Wordmark } from "../components/wordmark";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  component: Onboarding,
});

// MOCK — the seeder would pick ~FIRST_SESSION_SEED_WORDS near-frontier words (SEED-1/5).
const SEEDED = ["resilient_adj_01", "negotiate_verb_01"] as const;

// MOCK — a slice of the frontier band for per-word "I know this" marking (SEED-2).
const PLACEMENT_WORDS = [
  "allocate", "coherent", "diligent", "feasible", "meticulous",
  "advocate", "adverse", "compile", "concise", "viable",
];

type Step = "welcome" | "level" | "seeds" | "firstWin" | "tune";
const STEPS: Step[] = ["welcome", "level", "seeds", "firstWin", "tune"];

function Onboarding() {
  const [step, setStep] = useState<Step>("welcome");
  const reduced = useReducedMotion();

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
                STEPS.indexOf(s) <= STEPS.indexOf(step) ? "bg-amber" : "bg-paper-sunken",
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
            {step === "welcome" ? <Welcome onNext={() => setStep("level")} /> : null}
            {step === "level" ? <LevelStep onNext={() => setStep("seeds")} /> : null}
            {step === "seeds" ? <SeedsStep onNext={() => setStep("firstWin")} /> : null}
            {step === "firstWin" ? <FirstWinStep onNext={() => setStep("tune")} /> : null}
            {step === "tune" ? <TuneStep /> : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl leading-snug font-semibold text-ink">
        Grow the English you can actually <em className="text-amber-deep">use</em> — one written
        sentence at a time.
      </h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        Wikain trains active vocabulary: you don’t just recognize words, you write with them. Your
        sentence is the lesson.
      </p>
      <Button size="lg" className="w-full" onClick={onNext}>
        Get started <ArrowRight data-slot="icon" />
      </Button>
      <p className="text-center text-sm text-ink-faint">
        Already have an account?{" "}
        <Link to="/signin" className="font-medium text-ink underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

/** One coarse self-report question — the low-friction signal that sets the frontier (SEED-1). */
function LevelStep({ onNext }: { onNext: () => void }) {
  const [band, setBand] = useState<string | null>(null);
  const bands = [
    { id: "b1", label: "I manage, but writing takes effort", detail: "emails are slow, words feel just out of reach" },
    { id: "b2", label: "I write comfortably, but plainly", detail: "clear messages — I want more precise, formal range" },
    { id: "c1", label: "I write well and want the last 10%", detail: "polish, nuance, academic and professional vocabulary" },
  ];
  return (
    <div className="space-y-6">
      <h2 className="font-serif text-2xl font-semibold text-ink">
        How does your English writing feel at work?
      </h2>
      <div className="space-y-2.5">
        {bands.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBand(b.id)}
            className={cn(
              "w-full rounded-lg border px-4 py-3 text-left transition-colors duration-150",
              band === b.id
                ? "border-amber-deep bg-amber-wash"
                : "border-line bg-paper-raised hover:border-ink-faint",
            )}
          >
            <p className="text-sm font-medium text-ink">{b.label}</p>
            <p className="mt-0.5 text-xs text-ink-faint">{b.detail}</p>
          </button>
        ))}
      </div>
      <Button size="lg" className="w-full" disabled={!band} onClick={onNext}>
        Continue
      </Button>
      <p className="text-center text-xs text-ink-faint">
        A rough guess is fine — the schedule self-corrects within a few sessions.
      </p>
    </div>
  );
}

function SeedsStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-6">
      <h2 className="font-serif text-2xl font-semibold text-ink">Two words to start.</h2>
      <p className="text-sm leading-relaxed text-ink-soft">
        You’ll write your first sentence in about a minute.
      </p>
      <div className="space-y-3">
        {SEEDED.map((id) => {
          const item = mockItem(id);
          return (
            <div key={id} className="rounded-xl border border-line bg-paper-raised p-5">
              <p className="font-serif text-2xl font-semibold text-ink">{item.lemma}</p>
              <p className="mt-0.5 text-xs tracking-wide text-ink-faint uppercase">
                {item.pos} · {item.cefr}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{item.recognitionMeaning}</p>
            </div>
          );
        })}
      </div>
      <Button size="lg" className="w-full" onClick={onNext}>
        Write your first sentence <ArrowRight data-slot="icon" />
      </Button>
    </div>
  );
}

/** The first win (SEED-1) — a real judged production, before any placement test. */
function FirstWinStep({ onNext }: { onNext: () => void }) {
  const item = mockItem(SEEDED[0]);
  const [text, setText] = useState("");
  const [bounce, setBounce] = useState<MockBounceKind | null>(null);
  const [checking, setChecking] = useState(false);
  const [won, setWon] = useState(false);

  const submit = async () => {
    setBounce(null);
    const bounced = mockRuleLayer(text, item); // instant, no "checking…" (NET-2)
    if (bounced) {
      setBounce(bounced);
      return;
    }
    setChecking(true);
    const result = await mockJudgeSubmit(text, item);
    setChecking(false);
    // Onboarding demo: any judged outcome counts as reaching the win screen.
    if (result.kind === "judged") setWon(true);
  };

  if (won) {
    return (
      <div className="space-y-6">
        <CircleCheck className="size-10 text-moss" strokeWidth={1.5} />
        <h2 className="font-serif text-3xl font-semibold text-ink">That sentence is yours now.</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          “<span className="font-serif">{text}</span>”
        </p>
        <p className="text-sm leading-relaxed text-ink-soft">
          Every review works like this: real sentences, honestly checked. Want to tune your level,
          or keep going?
        </p>
        <Button size="lg" className="w-full" onClick={onNext}>
          Continue <ArrowRight data-slot="icon" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">your first sentence</p>
      <div>
        <h2 className="font-serif text-4xl font-semibold text-ink">{item.lemma}</h2>
        <p className="mt-1 text-xs tracking-wide text-ink-faint uppercase">
          {item.pos} · {item.cefr}
        </p>
      </div>
      <p className="text-sm leading-relaxed text-ink-soft">
        Write a sentence using <span className="font-serif italic">{item.lemma}</span> — ideally
        something true about you. {item.selfReferencePrompt}
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
        {bounce ? <BounceCallout kind={bounce} lemma={item.lemma} /> : null}
        {checking ? (
          <CheckingIndicator />
        ) : (
          <Button size="lg" className="w-full" onClick={submit} disabled={text.trim().length === 0}>
            Check my sentence
          </Button>
        )}
      </div>
    </div>
  );
}

/** Optional placement AFTER the win (SEED-2/3/4): per-word marking + LexTALE entry, both skippable. */
function TuneStep() {
  const navigate = useNavigate();
  const [known, setKnown] = useState<Set<string>>(new Set());

  const toggle = (w: string) =>
    setKnown((prev) => {
      const next = new Set(prev);
      if (next.has(w)) next.delete(w);
      else next.add(w);
      return next;
    });

  return (
    <div className="space-y-6">
      <h2 className="font-serif text-2xl font-semibold text-ink">Tune your level — optional.</h2>
      <div className="rounded-xl border border-line bg-paper-raised p-5">
        <p className="text-sm font-medium text-ink">Tap the words you already know.</p>
        <p className="mt-0.5 text-xs text-ink-faint">
          Known words skip the flashcard stage and go straight to production practice.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PLACEMENT_WORDS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => toggle(w)}
              className={cn(
                "rounded-full border px-3 py-1.5 font-serif text-base transition-colors duration-150",
                known.has(w)
                  ? "border-amber-deep bg-amber-wash text-ink"
                  : "border-line bg-paper text-ink-soft hover:border-ink-faint",
              )}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-line bg-paper-raised p-5">
        <p className="text-sm font-medium text-ink">Prefer precision?</p>
        <p className="mt-0.5 text-xs text-ink-faint">
          Take the 5-minute placement test (LexTALE) for a calibrated starting level.
        </p>
        {/* Visual entry point only — the published LexTALE instrument is deferred (SEED-4). */}
        <Button variant="outline" size="sm" className="mt-3" disabled>
          Take the placement test
        </Button>
      </div>
      <Button size="lg" className="w-full" onClick={() => navigate({ to: "/" })}>
        {known.size > 0 ? `Save ${known.size} known words and finish` : "Skip — keep going"}
      </Button>
    </div>
  );
}
