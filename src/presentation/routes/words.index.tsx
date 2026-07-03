/*
 * /words — the learner's word list: mastery, live retrievability vs the
 * counter floor (CNT-2/3), counted-status. DESIGN BUILD, MOCK-DRIVEN.
 */
import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { ChevronRight } from "lucide-react";

import { AppShell } from "../components/app-shell";
import { MasteryChip } from "../components/mastery-chip";
import { mockItem } from "../mock/catalog";
// MOCK DATA — replace with server functions when wiring.
import { MOCK_R_FLOOR, MOCK_WORDS, type MasteryState } from "../mock/learner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/words/")({
  component: WordsBrowser,
});

const FILTERS: (MasteryState | "All")[] = ["All", "Seen", "Recognized", "Productive", "Fluent"];

function WordsBrowser() {
  const reduced = useReducedMotion();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const words = MOCK_WORDS.filter(
    (w) => w.mastery !== "New" && (filter === "All" || w.mastery === filter),
  );

  return (
    <AppShell>
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-5"
      >
        <h1 className="font-serif text-2xl font-semibold text-ink">Your words</h1>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150",
                filter === f
                  ? "border-ink bg-ink text-paper-raised"
                  : "border-line bg-paper-raised text-ink-soft hover:border-ink-faint",
              )}
            >
              {f === "All" ? "All" : f.toLowerCase()}
            </button>
          ))}
        </div>

        <div className="divide-y divide-line rounded-xl border border-line bg-paper-raised">
          {words.map((w) => {
            const item = mockItem(w.senseId);
            const aboveFloor = w.retrievability >= MOCK_R_FLOOR;
            return (
              <Link
                key={w.senseId}
                to="/words/$wordId"
                params={{ wordId: w.senseId }}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-paper-sunken/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-serif text-lg text-ink">{item.lemma}</span>
                    {/* counted in "words you can use" (CNT-2) */}
                    {w.counted ? (
                      <span className="size-1.5 shrink-0 rounded-full bg-moss" title="In your usable words" />
                    ) : null}
                  </div>
                  {/* live retrievability vs COUNTER_R_FLOOR (CNT-3) */}
                  <div className="mt-1.5 h-1 w-24 overflow-hidden rounded-full bg-paper-sunken">
                    <div
                      className={cn("h-full rounded-full", aboveFloor ? "bg-moss" : "bg-terracotta")}
                      style={{ width: `${w.retrievability * 100}%` }}
                    />
                  </div>
                </div>
                <MasteryChip state={w.mastery} />
                <ChevronRight className="size-4 shrink-0 text-ink-faint" strokeWidth={1.5} />
              </Link>
            );
          })}
        </div>

        <p className="text-xs leading-relaxed text-ink-faint">
          The green dot marks words in your usable count — 2+ real sentences on separate days, and
          memory strength still above {Math.round(MOCK_R_FLOOR * 100)}%.
        </p>
      </motion.div>
    </AppShell>
  );
}
