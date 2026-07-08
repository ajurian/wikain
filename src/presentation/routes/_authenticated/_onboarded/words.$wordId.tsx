/*
 * /words/$wordId — per-word detail: mastery history with promotions AND
 * demotions at equal weight (CNT-1 honest ladder), retrievability vs the
 * counter floor. WIRED to the real read-model.
 *
 * The free-production *sentence text* is not shown: it is not persisted on
 * ReviewLog (DM-6), so v1 shows the move, not the words (memo work adds it).
 */
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, CircleCheck, CircleX } from "lucide-react";

import { AppShell } from "../../../components/app-shell";
import { MasteryChip } from "../../../components/mastery-chip";
import { wordDetailFn } from "../../../server/words";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_onboarded/words/$wordId")({
  component: WordDetail,
});

const TIER_LABEL: Record<string, string> = {
  recognition: "recognition",
  cloze: "cloze",
  cued: "cued production",
  free: "free production",
};

function BackLink() {
  return (
    <Link
      to="/words"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink"
    >
      <ArrowLeft className="size-4" strokeWidth={1.75} /> Your words
    </Link>
  );
}

function WordDetail() {
  const { wordId } = Route.useParams();
  const reduced = useReducedMotion();

  const { data: word, isPending } = useQuery({
    queryKey: ["word-detail", wordId],
    queryFn: () => wordDetailFn({ data: wordId }),
  });

  if (isPending) {
    return (
      <AppShell>
        <p className="text-sm text-ink-soft">Loading…</p>
      </AppShell>
    );
  }

  if (!word) {
    return (
      <AppShell>
        <p className="text-sm text-ink-soft">This word isn’t in your list.</p>
        <Link to="/words" className="mt-2 inline-block text-sm font-medium text-ink underline-offset-4 hover:underline">
          Back to your words
        </Link>
      </AppShell>
    );
  }

  const history = [...word.history].reverse(); // newest first

  return (
    <AppShell>
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-6"
      >
        <BackLink />

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl font-semibold text-ink">{word.lemma}</h1>
            <p className="mt-1 text-xs tracking-wide text-ink-faint uppercase">
              {word.pos}
              {word.cefr ? ` · ${word.cefr}` : ""}
            </p>
          </div>
          <MasteryChip state={word.mastery} className="mt-2" />
        </div>

        {word.recognitionMeaning ? (
          <p className="font-serif text-xl leading-relaxed text-ink">{word.recognitionMeaning}</p>
        ) : null}

        {/* memory strength (CNT-3 live retrievability) + counted status (CNT-2) */}
        <div className="rounded-xl border border-line bg-paper-raised p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium text-ink">Memory strength</p>
            <p className="text-sm text-ink-soft tabular-nums">{Math.round(word.retrievability * 100)}%</p>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-paper-sunken">
            <div
              className={cn("h-full rounded-full", word.aboveFloor ? "bg-moss" : "bg-terracotta")}
              style={{ width: `${word.retrievability * 100}%` }}
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            {word.counted
              ? "In your usable words — keep it above the line with an occasional sentence."
              : word.aboveFloor
                ? `Not yet counted: it takes 2+ real sentences on separate days (${word.judgedPassDays} so far).`
                : "Faded below the usable line — its next review will bring it back."}
          </p>
        </div>

        {/* review history — promotions and demotions with equal weight (CNT-1) */}
        <div className="space-y-3">
          <h2 className="text-xs font-medium tracking-wide text-ink-faint uppercase">History</h2>
          {history.length === 0 ? (
            <p className="text-sm text-ink-soft">Not reviewed yet — it’s waiting in your queue.</p>
          ) : (
            <ol className="space-y-0">
              {history.map((h, i) => (
                <li key={i} className="flex gap-3 border-l border-line pb-5 pl-4 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                      {h.outcome === "pass" ? (
                        <CircleCheck className="size-4 shrink-0 text-moss" strokeWidth={1.75} />
                      ) : (
                        <CircleX className="size-4 shrink-0 text-terracotta" strokeWidth={1.75} />
                      )}
                      <span className="font-medium text-ink">{TIER_LABEL[h.tier]}</span>
                      <span className="text-ink-faint">{h.day}</span>
                    </p>
                    {h.moved ? (
                      <p className="mt-1.5 flex items-center gap-2 text-xs text-ink-soft">
                        moved <MasteryChip state={h.moved.from} />
                        <ArrowRight className="size-3 text-ink-faint" />
                        <MasteryChip state={h.moved.to} />
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {word.modelSentence ? (
          <div className="rounded-xl bg-paper-sunken p-5">
            <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">Example</p>
            <p className="mt-1.5 font-serif text-base leading-relaxed text-ink-soft">
              “{word.modelSentence}”
            </p>
          </div>
        ) : null}
      </motion.div>
    </AppShell>
  );
}
